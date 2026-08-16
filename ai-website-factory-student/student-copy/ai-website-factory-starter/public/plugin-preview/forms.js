/* GYL Bookings — vanilla JS form wiring. No jQuery. Progressive enhancement:
   if JS fails or is disabled, the <form> POSTs directly to the REST endpoint. */

(function () {
	'use strict';

	if (typeof window.GYLBookings === 'undefined') {
		return;
	}

	var CFG = window.GYLBookings;
	var gmapsLoaded = false;
	var gmapsLoading = null;

	document.addEventListener('DOMContentLoaded', init);
	if (document.readyState !== 'loading') init();

	var inited = false;
	function init() {
		if (inited) return;
		inited = true;

		var forms = document.querySelectorAll('.gyl-bookings-form');
		Array.prototype.forEach.call(forms, wireForm);

		var quicks = document.querySelectorAll('[data-gyl-quick]');
		Array.prototype.forEach.call(quicks, wireQuick);
	}

	function wireForm(form) {
		wireTripTypeToggle(form);
		form.addEventListener('submit', function (ev) {
			ev.preventDefault();
			submit(form);
		});
	}

	function wireTripTypeToggle(form) {
		var radios = form.querySelectorAll('input[name="trip_type"]');
		Array.prototype.forEach.call(radios, function (r) {
			r.addEventListener('change', function () { applyTripType(form); });
		});
		applyTripType(form);
	}

	function applyTripType(form) {
		var sel = form.querySelector('input[name="trip_type"]:checked');
		var v = sel ? sel.value : 'one_way';
		var cells = form.querySelectorAll('[data-gyl-when]');
		Array.prototype.forEach.call(cells, function (cell) {
			var when = cell.getAttribute('data-gyl-when');
			var show =
				(when === 'two_way' && v === 'two_way') ||
				(when === 'hourly'  && v === 'hourly') ||
				(when === 'not-hourly' && v !== 'hourly');
			cell.hidden = !show;
			// Toggle required on the inner input.
			var input = cell.querySelector('input,select,textarea');
			if (input) {
				if (when === 'two_way' && v === 'two_way') input.required = true;
				else if (when === 'hourly' && v === 'hourly') input.required = true;
				else if (when === 'not-hourly' && v !== 'hourly') input.required = (input.name === 'dropoff_location');
				else input.required = false;
			}
		});
	}

	function submit(form) {
		var mode = form.getAttribute('data-gyl-mode') || 'quote';
		var endpoint = CFG.restUrl + (mode === 'reservation' ? 'reservation' : 'quote');
		var status = form.querySelector('[data-gyl-status]');
		var summary = form.querySelector('[data-gyl-summary]');
		var spinner = form.querySelector('.gyl-bookings-spinner');
		var btn = form.querySelector('button[type="submit"]');

		if (status) { status.hidden = true; status.textContent = ''; }
		if (summary) summary.hidden = true;
		if (spinner) spinner.hidden = false;
		if (btn) btn.disabled = true;

		gatherEstimates(form).then(function () {
			var data = serialize(form);
			return fetch(endpoint, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-WP-Nonce': CFG.nonce || '',
					'Accept': 'application/json'
				},
				body: JSON.stringify(data),
				credentials: 'same-origin'
			});
		}).then(function (r) {
			return r.json().then(function (j) { return { code: r.status, body: j }; });
		}).then(function (res) {
			if (spinner) spinner.hidden = true;
			if (btn) btn.disabled = false;

			if (res.body && res.body.ok) {
				if (status) {
					status.hidden = false;
					status.setAttribute('data-gyl-status-kind', 'success');
					status.textContent = mode === 'reservation'
						? 'Reservation submitted successfully.'
						: 'Quote request submitted. We will contact you shortly.';
				}
				if (mode === 'reservation' && summary) {
					summary.hidden = false;
					var codeEl = summary.querySelector('[data-gyl-code]');
					if (codeEl) {
						codeEl.textContent = res.body.confirmation_code || '(pending)';
					}
				}
				form.reset();
				applyTripType(form);
			} else {
				showError(status, (res.body && res.body.error) || ('http-' + res.code));
			}
		}).catch(function (err) {
			if (spinner) spinner.hidden = true;
			if (btn) btn.disabled = false;
			showError(status, (err && err.message) || 'network-error');
		});
	}

	function showError(status, msg) {
		if (!status) return;
		status.hidden = false;
		status.setAttribute('data-gyl-status-kind', 'error');
		status.textContent = 'Submission failed: ' + msg;
	}

	function serialize(form) {
		var out = {};
		var fd = new FormData(form);
		fd.forEach(function (val, key) {
			out[key] = val;
		});
		return out;
	}

	/* ------- Distance Matrix estimate (optional) ------- */

	function gatherEstimates(form) {
		var key = CFG.gmapsKey;
		if (!key) return Promise.resolve();

		var trip = (form.querySelector('input[name="trip_type"]:checked') || {}).value || 'one_way';
		if (trip === 'hourly') return Promise.resolve();

		var pickup = (form.querySelector('input[name="pickup_location"]') || {}).value;
		var dropoff = (form.querySelector('input[name="dropoff_location"]') || {}).value;
		if (!pickup || !dropoff) return Promise.resolve();

		return loadGmaps(key).then(function () {
			return new Promise(function (resolve) {
				try {
					var svc = new google.maps.DistanceMatrixService();
					svc.getDistanceMatrix({
						origins: [pickup],
						destinations: [dropoff],
						travelMode: google.maps.TravelMode.DRIVING
					}, function (resp, st) {
						if (st === 'OK' && resp && resp.rows && resp.rows[0] && resp.rows[0].elements && resp.rows[0].elements[0] && resp.rows[0].elements[0].status === 'OK') {
							var el = resp.rows[0].elements[0];
							setHidden(form, 'estimated_distance_km', (el.distance.value / 1000).toFixed(2));
							setHidden(form, 'estimated_duration_min', Math.round(el.duration.value / 60));
						}
						resolve();
					});
				} catch (e) {
					resolve();
				}
			});
		}).catch(function () { return; });
	}

	function setHidden(form, name, value) {
		var input = form.querySelector('input[name="' + name + '"]');
		if (input) input.value = value;
	}

	function loadGmaps(key) {
		if (gmapsLoaded || (typeof google !== 'undefined' && google.maps && google.maps.DistanceMatrixService)) {
			gmapsLoaded = true;
			return Promise.resolve();
		}
		if (gmapsLoading) return gmapsLoading;
		gmapsLoading = new Promise(function (resolve, reject) {
			var s = document.createElement('script');
			s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(key);
			s.async = true;
			s.defer = true;
			s.onload = function () { gmapsLoaded = true; resolve(); };
			s.onerror = reject;
			document.head.appendChild(s);
		});
		return gmapsLoading;
	}

	/* ------- Quick-quote modal ------- */

	function wireQuick(root) {
		var bar = root.querySelector('.gyl-bookings-quick-form');
		var modal = root.querySelector('[data-gyl-modal]');
		var form = modal ? modal.querySelector('.gyl-bookings-form') : null;

		if (bar) {
			bar.addEventListener('submit', function (ev) {
				ev.preventDefault();
				if (form) {
					prefillFromBar(bar, form);
				}
				openModal(modal);
			});
		}

		var closers = root.querySelectorAll('[data-gyl-close]');
		Array.prototype.forEach.call(closers, function (c) {
			c.addEventListener('click', function () { closeModal(modal); });
		});
		document.addEventListener('keydown', function (ev) {
			if (ev.key === 'Escape' && modal && !modal.hidden) closeModal(modal);
		});
	}

	function prefillFromBar(bar, form) {
		['pickup_location', 'dropoff_location', 'pickup_at'].forEach(function (name) {
			var src = bar.querySelector('[name="' + name + '"]');
			var dst = form.querySelector('[name="' + name + '"]');
			if (src && dst && src.value) dst.value = src.value;
		});
	}

	function openModal(modal) {
		if (!modal) return;
		modal.hidden = false;
		document.body.style.overflow = 'hidden';
	}
	function closeModal(modal) {
		if (!modal) return;
		modal.hidden = true;
		document.body.style.overflow = '';
	}
})();

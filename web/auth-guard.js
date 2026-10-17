(function () {
  var params = new URLSearchParams(window.location.search);
  if (params.get('preview') === 'true') return; // OBS browser source — skip auth

  /** True when the stored JWT is missing or past its `exp` claim. */
  function tokenExpired(token) {
    try {
      var payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now();
    } catch (e) {
      return true;
    }
  }

  var token = localStorage.getItem('stt_token');
  if (!token || tokenExpired(token)) {
    localStorage.removeItem('stt_token');
    localStorage.removeItem('stt_user');
    window.location.replace('/login.html');
  }
})();

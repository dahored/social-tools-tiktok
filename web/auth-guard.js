(function () {
  var params = new URLSearchParams(window.location.search);
  if (params.get('preview') === 'true') return; // OBS browser source — skip auth
  if (!localStorage.getItem('stt_token')) {
    window.location.replace('/login.html');
  }
})();

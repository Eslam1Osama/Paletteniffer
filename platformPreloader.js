// platformPreloader.js - Enhanced for EasOfTopia Platform
(function() {
  // 1. Apply theme as early as possible for seamless cross-app experience
  let theme = localStorage.getItem('theme');
  try { 
    theme = JSON.parse(theme); 
  } catch (e) {
    console.warn('Failed to parse theme from localStorage:', e);
  }
  
  // Apply theme immediately to prevent flash
  if (theme === 'dark') {
    document.body.classList.add('dark-mode');
    document.body.setAttribute('data-theme', 'dark');
  } else {
    document.body.classList.remove('dark-mode');
    document.body.setAttribute('data-theme', 'light');
  }

  // 2. Show preloader immediately (should already be in DOM)
  const preloader = document.getElementById('platform-preloader');

  // 3. Provide a global function to hide the preloader when the app is ready
  window.hidePlatformPreloader = function() {
    if (preloader) {
      preloader.classList.add('hide');
      setTimeout(() => preloader.remove(), 600); // Remove from DOM after fade
    }
  };

  // 4. Enhanced cross-tab and cross-app theme synchronization
  window.addEventListener('storage', function(event) {
    if (event.key === 'theme') {
      let newTheme = event.newValue;
      try { 
        newTheme = JSON.parse(newTheme); 
      } catch (e) {
        console.warn('Failed to parse theme from storage event:', e);
        return;
      }
      
      // Apply theme changes immediately
      if (newTheme === 'dark') {
        document.body.classList.add('dark-mode');
        document.body.setAttribute('data-theme', 'dark');
      } else {
        document.body.classList.remove('dark-mode');
        document.body.setAttribute('data-theme', 'light');
      }
      
      // Update preloader theme if visible
      if (preloader) {
        if (newTheme === 'dark') {
          preloader.classList.add('dark-mode');
        } else {
          preloader.classList.remove('dark-mode');
        }
      }
    }
  });
  
  // 5. Listen for custom theme change events within the same tab
  window.addEventListener('themeChanged', function(event) {
    const newTheme = event.detail.theme;
    if (newTheme === 'dark') {
      document.body.classList.add('dark-mode');
      document.body.setAttribute('data-theme', 'dark');
    } else {
      document.body.classList.remove('dark-mode');
      document.body.setAttribute('data-theme', 'light');
    }
  });
})(); 
// platformPreloader.js - Enhanced for EasOfTopia Platform
(function() {
  // 1. Force preloader to always display in light mode regardless of stored theme
  // Read stored theme but don't apply it to preloader - only to main app
  let storedTheme = localStorage.getItem('theme');
  try { 
    storedTheme = JSON.parse(storedTheme); 
  } catch (e) {
    console.warn('Failed to parse theme from localStorage:', e);
  }
  
  // Force preloader to light mode by ensuring no dark-mode class is applied
  // The preloader will always use light mode CSS variables
  document.body.classList.remove('dark-mode');
  document.body.setAttribute('data-theme', 'light');
  
  // Store the actual theme for the main app to use later
  window._storedTheme = storedTheme || 'light';

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
  // Note: Preloader always stays in light mode, only main app theme changes
  window.addEventListener('storage', function(event) {
    if (event.key === 'theme') {
      let newTheme = event.newValue;
      try { 
        newTheme = JSON.parse(newTheme); 
      } catch (e) {
        console.warn('Failed to parse theme from storage event:', e);
        return;
      }
      
      // Update stored theme for main app
      window._storedTheme = newTheme;
      
      // Only apply theme changes to main app, not preloader
      // Preloader remains in light mode regardless of theme changes
      if (newTheme === 'dark') {
        document.body.classList.add('dark-mode');
        document.body.setAttribute('data-theme', 'dark');
      } else {
        document.body.classList.remove('dark-mode');
        document.body.setAttribute('data-theme', 'light');
      }
      
      // Preloader theme is never changed - always stays light
    }
  });
  
  // 5. Listen for custom theme change events within the same tab
  // Note: Preloader always stays in light mode, only main app theme changes
  window.addEventListener('themeChanged', function(event) {
    const newTheme = event.detail.theme;
    
    // Update stored theme for main app
    window._storedTheme = newTheme;
    
    // Only apply theme changes to main app, not preloader
    // Preloader remains in light mode regardless of theme changes
    if (newTheme === 'dark') {
      document.body.classList.add('dark-mode');
      document.body.setAttribute('data-theme', 'dark');
    } else {
      document.body.classList.remove('dark-mode');
      document.body.setAttribute('data-theme', 'light');
    }
    
    // Preloader theme is never changed - always stays light
  });
})(); 
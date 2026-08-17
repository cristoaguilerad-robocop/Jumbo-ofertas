importScripts('https://www.gstatic.com/firebasejs/10.14.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.14.0/firebase-messaging-compat.js')

// Firebase config is injected at runtime via the app
// This SW handles background push messages from FCM
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {}
  const notification = data.notification || {}
  event.waitUntil(
    self.registration.showNotification(notification.title || 'Jumbo Ofertas', {
      body: notification.body || 'Hay nuevas ofertas en tu lista.',
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      tag: 'jumbo-offer',
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil(
    clients.openWindow(self.location.origin + '/#/list')
  )
})

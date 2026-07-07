import { createMeditationApp } from './ui/app.js';

const root = document.querySelector('#app');
if (root) {
  createMeditationApp(root);
}

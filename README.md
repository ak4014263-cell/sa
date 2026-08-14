# 🌿 JobSwipe — Auto-candidature Welcome to the Jungle

MVP de candidature automatique pour les offres Welcome to the Jungle. Interface de swipe Tinder + robot de remplissage automatique de formulaires.

## 🚀 Démarrage rapide

```bash
npm install
npm start
# Ouvrir http://localhost:3000
```

## 🎯 Fonctionnalités

- **Scraping WTTJ** — Récupère les offres en temps réel
- **Interface swipe** — Tinder-style (← passer, → postuler, ↑ super like)
- **Auto-apply** — Puppeteer ouvre un vrai navigateur et remplit le formulaire
- **Suivi temps réel** — SSE push updates + captures d'écran
- **Profil candidat** — Sauvegarde vos infos pour le remplissage auto

## ⌨️ Raccourcis clavier

| Touche | Action |
|--------|--------|
| → | Postuler |
| ← | Passer |
| ↑ | Super like |
| Échap | Fermer |

## 📁 Structure

```
├── server.js       # API Express + SSE
├── scraper.js      # Scraper Welcome to the Jungle
├── autoApply.js    # Bot Puppeteer auto-apply
└── public/
    ├── index.html  # Interface swipe
    ├── style.css   # Design premium dark
    └── app.js      # Logique frontend
```

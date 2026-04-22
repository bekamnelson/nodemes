# PixiChat 2.0

La messagerie instantanée pour étudiants — Web, Android & Desktop.

## 🚀 Démarrage rapide

### Prérequis
- Node.js 18+
- Compte MongoDB Atlas
- Compte Cloudinary (pour les uploads)

### Installation

```bash
# Cloner le projet
git clone https://github.com/bekamnelson/nodemes.git
cd nodemes

# Installer les dépendances
npm install

# Configurer les variables d'environnement
cp .env.example .env
# Editez .env avec vos clés MongoDB et Cloudinary

# Lancer le serveur
npm run server
```

Le serveur sera disponible sur http://localhost:3000

## 📁 Structure du projet

```
pixichat/
├── server.js              # Serveur Express + Socket.IO
├── main.js                # Electron (desktop)
├── package.json
├── .env.example
└── public/
    ├── index.html         # Page d'accueil
    ├── login.html         # Connexion
    ├── signup.html        # Inscription
    ├── chat.html          # Interface de chat
    ├── profile.html       # Profil utilisateur
    ├── Settings.html      # Paramètres
    ├── sw.js              # Service Worker (PWA)
    ├── css/
    │   ├── base.css       # Design system
    │   └── chat.css       # Styles du chat
    ├── js/
    │   ├── config.js      # URL serveur centralisée
    │   ├── chat.js        # Logique chat complète
    │   ├── dexie.js       # IndexedDB (offline)
    │   └── socket.io.js   # Client Socket.IO
    └── images/
        └── noprofil.png
```

## 🖥️ Version Desktop (Electron)

```bash
# Développement
npm start

# Packager pour Windows
npm run make
```

## 📱 Version Android (Capacitor)

```bash
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init PixiChat com.pixichat.app
npx cap add android
npx cap sync
npx cap open android
```

## 🌐 Déploiement Web (Render)

Le projet est configuré pour Render. Le `SERVER_URL` dans `public/js/config.js` pointe vers votre instance Render.

## ✅ Bugs corrigés (v2.0)

- `require("mongoose");js` → typo corrigée
- `bcrypt` → `bcryptjs` (cohérence avec package.json)
- Double déclaration `"scripts"` et `"build"` dans package.json
- `SERVER_URL` centralisé dans `config.js` (plus de duplication)
- Classe CSS thème unifiée : `dark` partout (plus de `dark-mode`)
- `Settings.js` orphelin supprimé, logique dans Settings.html
- Race condition `receiver` dans `markSeen` corrigée
- `editMessage` / `cancelReply` entrelacés → séparés proprement
- XSS via `innerHTML` → `escapeHtml()` sur tous les contenus utilisateur
- IDs messages inconsistants (`_id` vs `id`) → normalisés
- `openSettings()` référençant un élément inexistant → supprimé
- `socket.emit("readMessages")` sans handler serveur → handler ajouté
- Messages hors-ligne envoyaient les champs Dexie internes au serveur → nettoyés
- `console.log(data)` de débogage → supprimé
- Logout appelait `/logout` en relatif → utilise `SERVER_URL`
- Variables CSS dupliquées dans profile.css → nettoyées
- Balise `</div>` en trop dans profile.html → corrigée
- Upload de fichier ne populait pas `replyTo` → corrigé dans server.js
- `forwardMessage` renvoyait `success` sans `message` → corrigé
- `/user/:id` exposait le mot de passe → `.select('-password')` ajouté

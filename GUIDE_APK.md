# 📱 Guide — Compiler PixiChat en APK Android

## Prérequis
- Node.js 18+
- Android Studio (https://developer.android.com/studio)
- Java 17 (inclus dans Android Studio)

---

## Étape 1 — Installer Capacitor

```bash
cd pixichat
npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/splash-screen
```

---

## Étape 2 — Initialiser et synchroniser

```bash
npx cap add android
npx cap sync android
```

---

## Étape 3 — Configurer Android (IMPORTANT — corrige les erreurs de connexion)

### 3a. Copier le fichier de sécurité réseau
```bash
# Créer le dossier xml s'il n'existe pas
mkdir -p android/app/src/main/res/xml

# Copier le fichier fourni
cp android-config/network_security_config.xml android/app/src/main/res/xml/
```

### 3b. Modifier AndroidManifest.xml
Ouvrez `android/app/src/main/AndroidManifest.xml`

**Ajoutez dans `<manifest>`** :
```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
```

**Ajoutez dans `<application ...>`** :
```
android:networkSecurityConfig="@xml/network_security_config"
android:usesCleartextTraffic="true"
```

---

## Étape 4 — Ouvrir dans Android Studio

```bash
npx cap open android
```

Dans Android Studio :
1. Attendez que Gradle sync termine
2. **Build → Build Bundle(s) / APK(s) → Build APK(s)**
3. L'APK sera dans : `android/app/build/outputs/apk/debug/app-debug.apk`

---

## Étape 5 — Tester sur téléphone

```bash
# Avec un téléphone branché en USB (mode débogage activé)
npx cap run android
```

---

## ❓ Pourquoi les téléphones ne pouvaient pas se connecter ?

Les causes les plus fréquentes sur APK Android :

| Problème | Cause | Solution appliquée |
|---|---|---|
| `net::ERR_CLEARTEXT_NOT_PERMITTED` | Android 9+ bloque HTTP | `network_security_config.xml` |
| `ERR_CONNECTION_REFUSED` | Serveur Render endormi | Bannière wake-up dans `config.js` |
| `WebSocket connection failed` | Réseau bloque WS | Fallback polling Socket.IO |
| `CORS error` | Origin `null` d'APK rejeté | CORS élargi dans `server.js` |
| `Timeout` | Render prend 30-60s à démarrer | Retry automatique × 8 |

---

## 🔧 Commandes utiles

```bash
# Resync après modification des fichiers web
npx cap sync android

# Logs en temps réel depuis le téléphone
npx cap run android --livereload

# Ouvrir Chrome DevTools pour déboguer l'APK
# Dans Chrome : chrome://inspect/#devices
```

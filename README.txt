Guess the Opening, install-as-an-app update (PWA)

Do this AFTER the previous update (guess-the-opening-v3) is uploaded and checked.

Open your guess-the-opening repo on GitHub. Choose Add file, then Upload files, and drag in every file in this folder except this README. That is index.html, app.js, manifest.webmanifest, sw.js and the three icon-*.png files. index.html and app.js replace the old ones, so say yes if GitHub asks. Commit. No change to api.mjs is needed this time.

What it does: the game can now be installed to a phone's home screen with the queen icon and opens full screen like a normal app. It still always loads the newest version when online, and the online leaderboard and daily challenge are never saved offline.

To try it on your phone after it deploys: on Android in Chrome, open the menu and choose Install app (or Add to Home screen). On iPhone in Safari, tap the Share button then Add to Home Screen.

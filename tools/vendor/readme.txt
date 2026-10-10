vendor/three.min.js is Three.js r186 (MIT, see vendor/LICENSE-three.txt) bundled and minified with esbuild.
Only the classes listed in tools/vendor/three-entry.js are included. Add a name there if the game needs another class.

To rebuild (do it in two scratch folders OUTSIDE the game folder; never run builds inside a downloaded package):

  1. mkdir <scratch>/three-dl  &&  cd <scratch>/three-dl  &&  npm init -y  &&  npm install three@0.186.1
  2. mkdir <scratch>/esb       &&  cd <scratch>/esb       &&  npm init -y  &&  npm install esbuild
  3. From anywhere:
     <scratch>/esb/node_modules/.bin/esbuild tools/vendor/three-entry.js --bundle --minify --format=esm \
       --legal-comments=none --outfile=vendor/three.min.js \
       --alias:three=<scratch>/three-dl/node_modules/three/build/three.module.js
  4. Copy <scratch>/three-dl/node_modules/three/LICENSE to vendor/LICENSE-three.txt

The game itself has no build step: it loads vendor/three.min.js with a relative import.

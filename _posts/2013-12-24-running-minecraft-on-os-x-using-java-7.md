---
layout: post
title: "Running Minecraft on OS X using Java 7+"
date: 2013-12-24 02:32:00 -0000
---

**Update: Mojang has finally released a [new launcher](https://minecraft.net/download) that not only includes support for modern versions of Java, but also ditches support for deprecated versions like Java 6.**

**Update: I have created a shell script that does all of this automatically. All you need to do is make sure you have ant installed and run [this script](https://gist.github.com/KovuTheHusky/c70af0623aab4625ccebef1140fc5d11). Alternatively, you can still follow the directions below if you want to.**

If you made your way to this page it is probably because you are trying to run Minecraft on OS X and have Java 7+ installed instead of the older, deprecated Java 6. You have probably seen this dialog:

<a href="/images/Screen%20Shot%202017-10-13%20at%207.36.28%20PM.webp" data-fancybox><img src="/images/Screen%20Shot%202017-10-13%20at%207.36.28%20PM.webp" alt="Screen Shot 2017-10-13 at 7.36.28 PM"></a>

Why does this happen? Mojang is currently packaging their application using Apple's packager which only supports Apple published versions of Java. Apple stopped publishing their own versions of Java when Oracle released Java 7. Mojang should be using Oracle's packager now, but they are not.

How do I fix it? First of all, please go to the [bug report](https://bugs.mojang.com/browse/MCL-1049) on the bug tracker and vote for the issue and add any helpful comments you may have. Now, we can move on to the temporary fix:

1. Install [ant](https://ant.apache.org) using [Homebrew](https://brew.sh), [Macports](https://macports.org), or whatever else you prefer.

2. Download the [Java Application Bundler](https://java.net/projects/appbundler) from Oracle's Java website.

3. Download [Minecraft](https://minecraft.net/download) in JAR format (click "Show all platforms" and look under "Linux/Other") from Mojang's Minecraft website.

4. Create a file called "build.xml" and paste in [this code](https://gist.github.com/KovuTheHusky/f4a500f82acfb63abddc76236d6c8db3).

5. Create a folder named "dist" as well. Thanks to somebody in the comments that pointed this out! Originally it wasn't necessary.

6. Organize all your files like this: <a href="/images/Screen%20Shot%202017-10-13%20at%208.13.32%20PM.webp" data-fancybox><img src="/images/Screen%20Shot%202017-10-13%20at%208.13.32%20PM.webp" alt="Screen Shot 2017-10-13 at 8.13.32 PM"></a>

7. Open Terminal and change directory to the one with all of your files in it then run "ant bundle-Minecraft" and wait.

Now you should have a folder named "dist" with a file named "Minecraft.app" in it. Just move that to your Applications folder and use View Info to change the icon if you would like to.

# @ConveneBot

This is a sample bot for Telegram, made as an entry for [Telegram 2023 Mini App Contest](https://t.me/contest/327).

You can engage directly with the functioning bot [@ConveneBot](https://t.me/ConveneBot), or clone and modify this repository to fit your personal needs (see the [Deployment](#Deployment) section).

## Usage

The purpose of this bot is to help people plan events and vote for the most convenient days/times of them.

After starting the bot you can choose any group you're in and type "`@ConveneBot <EVENT NAME>`" in the new message input. You should see an option to create a new event — by tapping it you will send a link to a newly create event (which will open in a Mini App). Each member of a group can open this link and join event. After that everyone can select the most suitable time intervals.

The results of this voting can be interpreted by the organizers, who will finalize the actual date of the event (this part is not yet available in the UI, but can easily be done outside of the app).

## Deployment

The process of cloning this bot/app is rather straightforward. It's written in Node.js using Express framework and all data is stored in SQLite. This means that deployment does not require installation and configuration of an external database (but the source code can be modified to use it, of course).

First, make sure you have the latest version of [Node](https://nodejs.org/en) installed. It's also recommended to have [Git](https://git-scm.com/downloads) installed (to clone this repository). To keep the server running you can install [PM2](https://pm2.keymetrics.io/), for example. You can also use [Nginx](https://nginx.org/en/download.html) as a reverse proxy in front of this app.

Clone this repository into any directory:
```
git clone https://github.com/hip-hyena/ConveneBot.git
```
(or, if you don't use Git, just download this repo as a ZIP file and unpack it in any directory)

Go to directory where you cloned the repository and install dependencies:
```
cd ConveneBot
npm install
```

Now you need to configure your version of this app.

Visit [BotFather](https://t.me/BotFather) and create your bot. You can choose any name/username/description. Select "Inline Mode" in Bot Settings and turn it one (set the hint to something like "Enter name of new event..."). Also type `/newapp` and create a Mini App associated with the bot you've just created. Similarly, use "`https://<YOUR_HOSTNAME>/`" as an URL for your app. If you use Nginx, you can use the public path you've configured as `<YOUR_HOSTNAME>`.

Now create a text file named `.env` in the root directory of this repository. It should have the following contents:
```
TELEGRAM_USERNAME=<BOT_USERNAME>
TELEGRAM_TOKEN="<BOT_TOKEN>"
MINIAPP_HOST=<PUBLIC_URL>
MINIAPP_PORT=<INTERNAL_PORT>
```

Replace placeholders in angle brackets with the appropriate values and this file (enter `<BOT_USERNAME>` without an @-sign).

That's all for configuration. Now you can run the server:
```
node server.js
```

If you're using `PM2`, you can add this app to the list of continuously running scripts:
```
pm2 start --name YourBotName server.js
pm2 save
```

If you're using `Nginx`, don't forget to make sure you've configured it to correctly proxy requests from `<PUBLIC_URL>` to `localhost:<INTERNAL_PORT>`. You also may need to configure [Certbot](https://certbot.eff.org/) to acquire HTTPS certificates (you can follow [this tutorial](https://www.digitalocean.com/community/tutorials/how-to-secure-nginx-with-let-s-encrypt-on-ubuntu-20-04) for details).
# Skribblio-Bot
A bot purposed to extract the official skibbl.io word bank via participating in public games.

## How to use
1. Install [Node.js](https://nodejs.org/en/).
2. Create a new directory somewhere and copy all of the files over to the new directory.
3. Open a shell at the new directory and enter `npm install`.
4. After the installation is completed, enter `npm start`.
5. Watch the bot runs! The new words collected will be put into the `words_picked.json` file every 5 minutes by default.

**NOTE:** If you are planning to run the bot with a language other than English, please take a look at https://github.com/wlauyeung/Skribblio-Bot/issues/1. 

## Configurations
| Option | Usage |
| ------------- | ------------- |
| `numGames` | Default value is 3. The number of games the bot will initiate with. Note that setting this to a big number will increase the word collection rate but will also increase memory consumption drastically, therefore it is recommended to keep this number < 10.|
| `debug` | Default value is true. If you do not want the bot to print out what it is currectly doing, set this to false. |
| `language` | The language the bot uses to run with. The first letter of the language must be CAPITALIZED (e.g. English, Spanish). |

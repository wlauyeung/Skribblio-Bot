# Skribblio-Bot
A bot purposed to extract the official skibbl.io word bank via playing against itself in private games.

## How to use
1. Install [Node.js](https://nodejs.org/en/).
2. Create a new directory somewhere and copy all of the files over to the new directory.
3. Open a shell at the new directory and enter `npm install`.
4. After the installation is completed, enter `npm start`.
5. Watch the bot runs! The new words collected will be put into the `unsorted_words.json` file every 5 minutes by default.

## Configurations
| Option | Usage |
| ------------- | ------------- |
| `numGames` | Default value is 3. The number of games the bot will initiate with. Note that setting this to a big number will increase the word collection rate but will also increase memory consumption drastically, therefore it is recommended to keep this number < 10.|
| `debug` | Default value is true. If you do not want the bot to print out what it is currectly doing, set this to false. |
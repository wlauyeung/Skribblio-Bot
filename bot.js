import puppeteer, { Page, Browser } from "puppeteer";
import { writeFile } from "node:fs";
import config from './config.json' assert {type: 'json'};
import wordFile from "./unsorted_words.json" assert {type: 'json'};

class WordBank {
  static PATH = './unsorted_words.json';
  static SAVE_TIMER = 5 * 60 * 1000; // 5 mins

  /** @type {Map<String, Number>} */
  #words

  constructor() {
    this.#words = (wordFile.length !== 0) ? wordFile : {};
    setInterval((wb=this) => {wb.save()}, WordBank.SAVE_TIMER);
  }

  /**
   * Add a word to the word bank. If it has appeared before
   * increase its count.
   * @param {String} word The word to be added.
   */
  addWord(word) {
    if (this.#words[word] === undefined) {
      this.#words[word] = 0;
    }
    this.#words[word]++;
  }

  save() {
    writeFile(WordBank.PATH, JSON.stringify(this.words), (err) => {
      console.error(err);
    });
  }

  get words() {
    return this.#words;
  }
}

class Player {
  static CREATE_BTN_SEL = '.button-create';
  static INV_URL_SEL = '#input-invite';
  static PLAY_BTN_SEL = '.button-play';
  static START_BTN_SEL = '#start-game';
  static CHAT_SEL = '.chat-container > form > input';
  static GAME_WORD_SEL = '#game-word';

  /** @type {Boolean} */
  #loaded;
  /** @type {Page} */
  #page;
  /** @type {Boolean} */
  #inRoom;
  /** @type {Boolean} */
  #leader;
  /** @type {String} */
  #name;
  /** @type {String[]} */
  #oldWords;
  /** @type {Number} */
  #language;

  constructor(name, language=0) {
    this.#page = null;
    this.#inRoom = false;
    this.#loaded = false;
    this.#leader = false;
    this.#name = name;
    this.#oldWords = ['\'\'', '\'\'', '\'\''];
    this.#language = language;
  }
  
  /**
   * @param {Browser} browser 
   */
  async init(browser) {
    this.#page = await browser.newPage();
    await this.#page.setViewport({
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
    });
    this.#loaded = true;
  }

  /**
   * Starts a new private game from the home page and returns
   * the URL of the room.
   * @returns {String} The URL of the private room.
   */
   async createRoom() {
    if (!this.#loaded) return;
    await this.#page.goto('https://skribbl.io', {waitUntil: 'networkidle2'});
    await this.#page.waitForSelector(Player.CREATE_BTN_SEL);
    await this.#page.click(Player.CREATE_BTN_SEL);
    await this.wait(2000);
    const node = await this.#page.$(Player.INV_URL_SEL);
    this.#inRoom = true;
    this.#leader = true;
    await this.selectRounds(Game.ROUNDS);
    await this.changeLanguage(this.#language);
    return await (await node.getProperty('value')).jsonValue();
  }

  /**
   * Joins an existing private game.
   * @param {String} roomURL The URL of the private room.
   */
  async joinGame(roomURL) {
    if (!this.#inRoom && this.#loaded) {
      await this.#page.goto(roomURL, {waitUntil: 'networkidle2'});
      await this.#page.waitForSelector(Player.PLAY_BTN_SEL);
      await this.#page.click(Player.PLAY_BTN_SEL);
      await this.wait(2000);
      this.#inRoom = true;
    }
  }

  /**
   * Starts the game if the player is a leader of a room.
   */
  async startGame() {
    if (!this.#leader) return;
    await this.#page.click(Player.START_BTN_SEL);
  }
  
  /**
   * Saves the page as a pdf. For debugging only.
   */
  async printPage() {
    if (!this.#loaded) return;
    await this.#page.pdf({path: 'page.pdf', format: 'A4'});
  }

  /**
   * This player's turn. Records the choices and pick a random word to draw.
   * @return {[String, String[]]} The player's choice, words given.
   */
  async chooseWord() {
    if (!this.#inRoom) return ['', []];
    const choice = Math.floor(Math.random() * 3);
    const wordElems = await this.#page.$$('.words > .word');
    for (let i = 0; i < wordElems.length; i++) {
      this.#oldWords[i] = await (await wordElems[i].getProperty('textContent')).jsonValue();
    }
    await wordElems[choice].click();
    return [this.#oldWords[choice], this.#oldWords];
  }

  /**
   * Changes the language.
   * @param {Number} value The number correspoding to the language desired.
   */
    async changeLanguage(value) {
      if (!this.#leader) return;
      const sel = await this.#page.$('#item-settings-language');
      await sel.select(`${value}`);
    }

  /**
   * Sends the word that the other player picked.
   * @param {String} word The choice to be sent.
   */
  async submitWord(word) {
    if (!this.#inRoom) return;
    const chat = await this.#page.$(Player.CHAT_SEL);
    await this.#page.$eval(Player.CHAT_SEL, (e, w) => e.setAttribute('value', w), word);
    await this.#page.focus(Player.CHAT_SEL);
    await this.#page.keyboard.press('Enter');
  }

  /**
   * Change the number of rounds each game has.
   * @param {Number} rounds Number of desired rounds.
   */
  async selectRounds(rounds) {
    if (!this.#leader) return;
    const sel = await this.#page.$('#item-settings-rounds');
    await sel.select(`${rounds}`);
  }

  /**
   * Idles until new choices are given.
   */
  async waitForChoicesGiven() {
    const sel = '.words > .word';
    const attr = 'textContent';
    const timeout = 30000;
    let timer = 0;
    await this.#page.waitForSelector(sel);
    let currentWord = await (await (await this.#page.$(sel)).getProperty(attr)).jsonValue();
    while (currentWord === this.#oldWords[0] && timer <= timeout) {
      await this.wait(500);
      timer += 500;
      currentWord = await (await (await this.#page.$(sel)).getProperty(attr)).jsonValue();
    }
    if (timer > timeout) throw new Error('timedout from waiting for new choices');
    await this.wait(500);
  }

  /**
   * Idles until a new word is picked by the opponant.
   */
    async waitForWordPicked() {
    const code = `document.getElementById('game-word').firstChild.textContent === "GUESS THIS"`;
    await this.#page.waitForFunction(code);
    await this.wait(500);
  }

  /**
   * Idles for a specific time in miliseconds.
   * @param {Number} time Time is miliseconds.
   */
  async wait(time) {
    await new Promise(r => setTimeout(r, time));
  }

  get name() {
    return this.#name;
  }
}

class Game {
  static ROUNDS = 10;
  static RESTART_TIMER = 15000;

  /** @type {WordBank} */
  #wordBank;
  /** @type {Player} Player 1 */
  #p1
  /** @type {Player} Player 2 */
  #p2;
  /** @type {Player} The current player */
  #turn;
  /** @type {Number} */
  #round;
  /** @type {Boolean} */
  #debug

  constructor(wordBank, language=0) {
    this.#wordBank = wordBank;
    this.#round = 1;
    this.#debug = config.debug;
    this.#p1 = new Player("Player 1", language);
    this.#p2 = new Player("Player 2", language);
    this.#turn = this.#p2;
  }

  /**
   * Setup the game.
   * @param {Browser} browser 
   */
  async init(browser) {
    await this.#p1.init(browser);
    await this.#p2.init(browser);

    const roomURL = await this.#p1.createRoom();
    await this.#p1.wait(2000);
    await this.#p2.joinGame(roomURL);
  }

  /**
   * Runs the recording process.
   */
  async run() {
    let opponant = this.opposite();
    this.log("Starting a new game...");
    await this.#p1.startGame();

    while(true) {
      this.log(`${this.#turn.name} is waiting for choices to be given`)
      await this.#turn.waitForChoicesGiven();
      this.log(`${this.#turn.name} is choosing a word`)
      const result = await this.#turn.chooseWord();
      this.log(`${this.#turn.name} picked the word ${result[0]} among the choices of ${result[1]}`);
      result[1].forEach(w => {
        this.#wordBank.addWord(w);
      });
      await opponant.waitForWordPicked();
      await opponant.submitWord(result[0]);
      this.log(`${opponant.name} submitted the word ${result[0]}`);
      this.#turn = opponant;
      opponant = this.opposite();
      if (this.#round === Game.ROUNDS * 2) {
        this.log('Game ended. Restarting...');
        this.#round = 0;
        await this.#p1.wait(Game.RESTART_TIMER);
        this.log("Starting a new game...");
        await this.#p1.startGame();
      }
      if (this.#round % 2 == 0) {
        this.log(`Moving on to round ${(this.#round / 2) + 1}`);
      }
      this.#round++;
      this.log(`==========================================`);
    }
  }

  /**
   * Returns the guessing player.
   * @returns {Player} The gussing player.
   */
  opposite() {
    return (this.#turn === this.#p1) ? this.#p2 : this.#p1;
  }

  /**
   * Prints to the console if debug mode is on.
   * @param {String} message The message.
   */
  log(message) {
    if (this.#debug) console.log(message);
  }

  get wordBank() {
    return this.#wordBank;
  }

  get p1() {
    return this.#p1;
  }

  get p2() {
    return this.#p2;
  }
}

(async () => {
  const browser = await puppeteer.launch();
  const wb = new WordBank();
  const NUMGAMES = config.numGames;
  const LANGUAGES = {
    'English': 0, 'German': 1, 'Bulgarian': 2, 'Czech': 3, 'Danish': 4, 'Dutch': 5, 'Finnish': 6,
    'French': 7, 'Estonian': 8, 'Greek': 9, 'Hebrew': 10, 'Hungarian': 11, 'Italian': 12, 'Japanese': 13,
    'Korean': 14, 'Latvian': 15, 'Macedonian': 16, 'Norwegian': 17, 'Portuguese': 18, 'Polish': 19,
    'Romanian': 20, 'Russian': 21, 'Serbian': 22, 'Slovakian': 23, 'Spanish': 24, 'Swedish': 25,
    'Tagalog': 26, 'Turkish': 27
  }

  while(true) {
    try {
      console.log("Closing pages and starting a new game...");
      const pages = await browser.pages();
      for (const page of pages) await page.close();
      const games = [];
      const language = LANGUAGES[config.language] === undefined ? 0 : LANGUAGES[config.language];
      for (let i = 0; i < NUMGAMES; i++) {
        games[i] = new Game(wb, language);
        await games[i].init(browser);
      }

      for (let i = 0; i < NUMGAMES - 1; i++) {
        games[i].run();
      }

      await games[games.length - 1].run();
    } catch (e) {
      console.error(e);
    }
  }
})();
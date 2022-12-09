import puppeteer, { Page, Browser } from "puppeteer";
import { writeFile } from "node:fs"
import wordFile from "./words_picked.json" assert {type: 'json'};
import sortedWords from "./words.json" assert {type: 'json'};
const config = { attributes: true, childList: true, subtree: true };

class WordBank {
  static PATH = './words_picked.json';
  static SAVE_TIMER = 10000; // 5 mins

  /** @type {Map<String, Number>} */
  #words

  constructor() {
    this.#words = (wordFile.length !== 0) ? wordFile : {};
    setInterval((wb=this) => {wb.save()}, WordBank.SAVE_TIMER);
  }

  /**
   * Add a word to the word bank. If it has appeared before
   * increase its count.
   * @param {String} word The word to be added
   */
  addWord(word, numplayers, correctGusses) {
    if (this.#words[word] === undefined) {
      this.#words[word] = {
        appearance: 0,
        playersEncounterd: 0,
        correctGusses: 0
      }
    }
    this.#words[word] = {
      appearance: this.#words[word].appearance + 1,
      playersEncounterd: this.#words[word].playersEncounterd + numplayers,
      correctGusses: this.#words[word].correctGusses + correctGusses
    }
  }

  /**
   * Turns the word bank into a format readable by Skribbl.io Helper.
   * @returns {String} A format readable by Skribbl.io Helper
   */
  format() {

  }

  save() {
    writeFile(WordBank.PATH, JSON.stringify(this.words), (err) => {
      console.error(err);
    });
  }

  toString() {
    return this.#words;
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
  /** @type {String} */
  #name;
  /** @type {String} */
  #oldWord;
  /** @type {Number} */
  #playerCount;
  /** @type {Number} */
  #correctGuesses;

  constructor(name) {
    this.#page = null;
    this.#loaded = false;
    this.#name = name;
    this.#oldWord = '';
    this.#playerCount = 0;
    this.#correctGuesses = 0;
  }
  
  /**
   * 
   * @param {Browser} browser 
   */
  async init(browser) {
    this.#page = await browser.newPage();
    await this.#page.setViewport({
      width: 1280,
      height: 720,
      deviceScaleFactor: 1,
    });
    this.#loaded = true;
  }

  /**
   * Joins an existing private game.
   */
  async joinGame() {
    await this.#page.goto('https://skribbl.io', {waitUntil: 'networkidle2'});
    await this.#page.waitForSelector(Player.PLAY_BTN_SEL);
    const playBtn = await this.#page.$(Player.PLAY_BTN_SEL);
    await playBtn.click();
    await this.wait(2000);
  }

  /**
   * Sends the word that the other player picked.
   * @param {String} word The choice to be sent
   */
  async submitWord(word) {
    const chat = await this.#page.$(Player.CHAT_SEL);
    await this.#page.$eval(Player.CHAT_SEL, (e, w) => e.setAttribute('value', w), word);
    await this.#page.focus(Player.CHAT_SEL);
    await this.#page.keyboard.press('Enter');
  }
  
  /**
   * Saves the page as a pdf. For debugging only.
   */
  async printPage() {
    if (!this.#loaded) return;
    await this.#page.pdf({path: 'page.pdf', format: 'A4'});
  }

  /**
   * Idles until a round is finished and the answer is given.
   */
  async waitForRoundFinished() {
    const sel = '.reveal > p > span:last-child';
    const attr = 'textContent';
    const timeout = 85000; // 85 seconds
    let timer = 0;
    let clue = '';
    let submitted = false;
    await this.#page.waitForSelector(sel);
    let currentWord = await (await (await this.#page.$(sel)).getProperty(attr)).jsonValue();
    while (currentWord === this.#oldWord && timer <= timeout) {
      await this.wait(500);
      timer += 500;
      if (timer % 2000 === 0) {
        let newClue = await this.unwrapClue();
        if (clue !== newClue && !submitted) {
          const solutions = this.findSolutions(newClue);
          if (solutions.length > 0 && solutions.length <= 7) {
            new Promise(async (resolve, reject) => {
              for (const key of Object.keys(solutions)) {
                await this.submitWord(solutions[key].word);
                await this.wait(1000);
              }
              resolve();
            });
            submitted = true;
          }
        }
      }
      currentWord = await (await (await this.#page.$(sel)).getProperty(attr)).jsonValue();
      if (currentWord === this.#oldWord) {
        this.#correctGuesses = (await this.#page.$$('.players-list > .guessed')).length;
      }
    }
    if (timer > timeout) throw new Error('timedout from waiting for answer');
    this.#playerCount = (await this.#page.$$('.players-list > .player')).length - 2;
    if (submitted) {
      this.#correctGuesses--;
    }
    this.#oldWord = currentWord;
    if (this.#oldWord === '') {
      await this.waitForRoundFinished();
    }
    await this.wait(500);
  }

  /**
   * Turns a DOM node that contains the hint into a string
   * that is interruptable by the program.
   * @returns {String} A clue interruptable by findSolutions()
   */
  async unwrapClue() {
    const hints = await this.#page.$$('.hints > div > .hint');
    let clue = '';
    for (const hint of hints) {
      clue += await (await hint.getProperty('textContent')).jsonValue();
    }
    return clue;
  }

  /**
   * Finds a list of pontential answers by filtering out wrong guesses with a clue.
   * @param {String} clue 
   * @returns {String[]} A list of potential answers
   */
  findSolutions(clue) {
    const numWords = clue.split(' ').length;
    const lens = clue.split(' ').map(word => word.length);
    clue = clue.replaceAll(' ', '').replaceAll('-', '').toLowerCase();
    if (sortedWords[numWords] !== undefined && sortedWords[numWords][clue.length] !== undefined) {
      let guesses = sortedWords[numWords][clue.length];
      let letterPos = 0;

      if (numWords > 1) {
        guesses = guesses.filter(guess => guess.lens.every((e, i) => e === lens[i]));
      }

      while (clue.length !== 0) {
        let letter = '';
        while (clue.charAt(0) === '_') {
          clue = clue.substring(1);
          letterPos++;
        }
        letter = clue.charAt(0).toLowerCase();
        if (letter !== '') {
          guesses = guesses.filter((guess) => guess.letters.charAt(letterPos) === letter);
        }
        clue = clue.substring(1);
        letterPos++;
      }
      return guesses;
    } else {
      return [];
    }
  }

  /**
   * Idles for a specific time in miliseconds.
   * @param {Number} time Time is miliseconds 
   */
  async wait(time) {
    await new Promise(r => setTimeout(r, time));
  }

  /**
   * Returns the word extracted by the bot this round.
   */
  getWord() {
    return this.#oldWord;
  }

  get playerCount() {
    return this.#playerCount;
  }

  get correctGusses() {
    return this.#correctGuesses;
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
  /** @type {Number} */
  #round;
  /** @type {Boolean} */
  #debug

  constructor(wordBank) {
    this.#p1 = new Player("Player 1");
    this.#wordBank = wordBank;
    this.#round = 1;
    this.#debug = true;
  }

  /**
   * Setup the game.
   * @param {Browser} browser 
   */
  async init(browser) {
    await this.#p1.init(browser);
  }

  /**
   * Runs the recording process.
   */
  async run() {
    while(true) {
      this.log("Joining a new game...");
      await this.#p1.joinGame();
      this.log('Waiting for the round to end');
      await this.#p1.waitForRoundFinished();
      this.log('Adding a new word');
      this.#wordBank.addWord(this.#p1.getWord(), this.#p1.playerCount, this.#p1.correctGusses);
    }
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
}

(async () => {
  const browser = await puppeteer.launch({headless: false});
  const wb = new WordBank();
  const numGames = 1;
  while(true) {
    try {
      console.log("Closing pages and starting a new game...");
      const pages = await browser.pages();
      for (const page of pages) await page.close();
      const games = [];

      for (let i = 0; i < numGames; i++) {
        games[i] = new Game(wb);
        await games[i].init(browser);
      }

      for (let i = 0; i < numGames - 1; i++) {
        games[i].run();
      }

      await games[games.length - 1].run();
    } catch (e) {
      console.error(e);
    }
  }
})();
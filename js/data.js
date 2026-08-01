/**
 * Game content, extracted from the Canva design (DAHRCuKC6js) on 2026-08-01.
 *
 * This is only the *seed*. Once the game has been saved once, the copy in
 * IndexedDB wins and this file is never read again — so editing questions in
 * the browser is the normal workflow, not editing this file.
 *
 * Question shape:
 *   { id, prompt, options, correct, answer, label, media, done }
 *
 * options  — array of choice strings. Empty array = open question, no choices.
 * correct  — index into options, or -1 when there is no single right choice.
 * answer   — free text shown at the reveal. For multiple choice it is optional;
 *            the correct option is highlighted regardless.
 *
 * media is null, or:
 *   { kind: 'image' | 'video' | 'audio', mediaId }   — uploaded, blob in IndexedDB
 *   { kind: 'image' | 'video' | 'audio', url }       — file under ./assets/
 *   { kind: 'youtube', url, videoId }                — embedded player
 */

export const SCHEMA_VERSION = 2;

let seq = 0;
const uid = (p) => `${p}${(++seq).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const A = './assets/';

/** Multiple-choice question. */
function mc(prompt, options, correct, extra = {}) {
  return {
    id: uid('q'),
    prompt,
    options,
    correct,
    answer: extra.answer || '',
    label: '',
    media: extra.media || null,
    done: false,
  };
}

/** Open question — no choices, just a written answer. */
function open(prompt, answer, extra = {}) {
  return {
    id: uid('q'),
    prompt,
    options: [],
    correct: -1,
    answer,
    label: '',
    media: extra.media || null,
    done: false,
  };
}

const img = (file) => ({ kind: 'image', url: A + file });
const vid = (file, opts = {}) => ({ kind: 'video', url: A + file, ...opts });

function cat(name, icon, color, questions) {
  return { id: uid('c'), name, icon, color, questions };
}

export function defaultGame() {
  seq = 0;

  return {
    schema: SCHEMA_VERSION,
    title: 'TRIVIA NIGHT',
    activeRound: 0,
    updatedAt: new Date().toISOString(),
    rounds: [
      /* ══ Round 1 — General Knowledge ═══════════════════════ */
      {
        id: 'r1',
        name: 'Round 1',
        subtitle: 'General Knowledge',
        icon: '🟢',
        color: '#4ade80',
        hideCategories: false,
        gridCols: 3,
        categories: [
          cat('Pop Culture', '🎬', '#f9a8d4', [
            mc('Who made the phrase “Hakuna Matata” famous?', [
              'Alex and Marty',
              'Shrek and Donkey',
              'Timon and Pumbaa (The Lion King)',
              'Dirty Mafia',
            ], 2),

            mc('This video features a famous tune often used in TikTok challenges. What is the name of the tune?', [
              'William Tell Overture',
              'Can-Can (Infernal Galop)',
              'The Blue Danube',
              'Hungarian Dance No. 5',
            ], 1, { media: vid('r1-popculture-q2-video.mp4') }),

            mc('Which of these singers performed at the 2026 FIFA World Cup Final Halftime Show?', [
              'Madonna',
              'Justin Bieber',
              'Harry Styles',
              'Jennifer Lopez',
            ], 1),
          ]),

          cat('History and Geography', '🌍', '#93c5fd', [
            mc('Based on the video, where is this famous historical site located?', [
              'Luxor, Egypt',
              'Petra, Jordan',
              'Baalbek, Lebanon',
              'Cappadocia, Türkiye',
            ], 1, { media: vid('r1-history-q1-video.mp4') }),

            mc('Whose assassination triggered the beginning of World War I?', [
              'Franz Ferdinand — Serbian',
              'Franz Ferdinand — Austrian',
              'Gavrilo Princip — Austrian',
              'Gavrilo Princip — Serbian',
            ], 1),

            mc('Which pin on the map shows the location of Croatia?', [
              'Pin A',
              'Pin B',
              'Pin C',
              'Pin D',
            ], 2, { media: img('r1-history-q3-map.png') }),
          ]),

          cat('Sports and Nutrition', '⚽', '#fcd34d', [
            mc('Which of these fruits contains the most calories per 100 grams?', [
              'Banana',
              'Mango',
              'Pineapple',
              'Avocado',
            ], 3),

            mc('This video shows one of the most infamous incidents in World Cup history. Which player bit his opponent during the match?', [
              'Pepe',
              'Sergio Ramos',
              'Luis Suárez',
              'Diego Costa',
            ], 2, { media: vid('r1-sports-q2-suarez.mp4') }),

            mc('Erling Haaland has inspired many viral memes — but which one did he reveal is his personal favourite?', [
              'A',
              'B',
              'C',
              'D',
            ], 2, { media: img('r1-sports-q3-haaland.png') }),
          ]),
        ],
      },

      /* ══ Round 2 — Lebanese Edition ════════════════════════ */
      {
        id: 'r2',
        name: 'Round 2',
        subtitle: 'Lebanese Edition',
        icon: '🟡',
        color: '#fcd34d',
        hideCategories: false,
        gridCols: 3,
        categories: [
          cat('Guess the Logo', '⭐', '#fcd34d', [
            mc('Which brand does this blurred logo belong to?', [
              'Ghandour Bakery',
              'Gandour',
              'Ghrawi',
              'Gouté Snacks',
            ], 1, { media: img('r2-logo-q1-gandour.png') }),

            mc('Which Lebanese dessert brand does this blurred logo belong to?', [
              'Better from Scratch',
              'X & Dough',
              'Xtra Dough',
              'Xtreme Donuts',
            ], 1, { media: img('r2-logo-q2-xanddough.png') }),

            mc('Which brand does this blurred logo belong to?', [
              'Dunkin’ Donuts',
              'Krispy Kreme',
              'Wooden Bakery',
              'Netflix',
            ], 2, { media: img('r2-logo-q3-woodenbakery.jpg') }),
          ]),

          cat('Lebanese Proverbs', '💬', '#a78bfa', [
            mc('أي مثل بيوصف هالصورة؟ — Which proverb matches the picture?', [
              'دق الحديد وهو حامي',
              'دق الباب واستنى الجواب',
              'دق قلبك قبل ما تدق الباب',
              'دق المي مي',
            ], 3, { media: img('r2-proverbs-q1.png') }),

            mc('أي مثل بيوصف هالصورة؟ — Which proverb matches the picture?', [
              'على قدّ بساطك مدّ إجريك',
              'اللي بينام ع الأرض ما بيخاف من الوقعة',
              'القناعة كنز لا يفنى',
              'لا تمدّ إيدك أكتر من طاقتك',
            ], 0, { media: img('r2-proverbs-q2.png') }),

            mc('أي مثل بيوصف هالصورة؟ — Which proverb matches the picture?', [
              'طبّ الجرّة ع تمّها بتطلع البنت لأمّها',
              'فرخ البط عوام',
              'من شابه أباه فما ظلم',
              'الطبع غلّاب',
            ], 0, { media: img('r2-proverbs-q3.png') }),
          ]),

          cat('Lebanese Music', '🎵', '#5eead4', [
            mc('What is Wael Kfoury’s real name?', [
              'Wael Michel Kfoury',
              'Michel Emile Kfoury',
              'Wael Joseph Haddad',
              'Michel Wael Saad',
            ], 1),

            mc('Who was the first Lebanese singer to sing at the FIFA World Cup?', [
              'Nancy Ajram',
              'Myriam Fares',
              'Fairuz',
              'Carole Samaha',
            ], 1),

            mc('Who performed in front of Pope John Paul II during his visit to Lebanon in 1997?', [
              'Fairuz',
              'Julia Boutros',
              'Majida El Roumi',
              'Carole Samaha',
            ], 2),
          ]),
        ],
      },

      /* ══ Round 3 — Challenge Time! (under construction) ════ */
      {
        id: 'r3',
        name: 'Final Round',
        subtitle: 'Challenge Time!',
        icon: '🔴',
        color: '#f87171',
        hideCategories: true,
        gridCols: 3,
        categories: [
          cat('Challenge Time!', '🔥', '#f87171', [
            open('I have cities, but no houses. I have mountains, but no trees. I have water, but no fish. What am I?',
              'Maps'),

            open('Watch the video twice. After watching the video, ask the question:\n\nWhat was the colour of Marc Anthony’s tie?',
              'Yellow',
              { media: vid('r3-q2-video.mp4') }),

            open('While this song is playing, your team must keep dancing. Each team member must name four animals beginning with the letter C before the song ends. No repeated answers!',
              'Judges’ call',
              { media: vid('r3-q3-song.mp4') }),

            open('Group memory challenge:\n\nAsk the group to focus well, and read this story aloud ONE time:\n\n“Sarah went to the supermarket on Monday. She bought apples, milk, and chocolate. She met her friend Lina near the entrance, who was wearing a red jacket. Sarah then took a taxi home because it was raining.”',
              'What colour was Lina’s jacket? — Red\nWhat did Sarah buy? — Chocolate, apples, milk\nHow much did they cost? — Not mentioned (we don’t know)\nHow did Lina get home? — Not mentioned (we don’t know)'),

            open('How long does sunlight take to reach Earth?\n\nDistance: 150,000,000 km · Speed of light: 300,000 km/second.\nCan you calculate the travel time?',
              '500 seconds — 8 minutes and 20 seconds',
              { media: img('r3-q5-image.jpg') }),

            open('لا أمشي، لكنني سافرت إلى كل دول العالم.\nلا أتكلم، لكنني أعرّف الناس عن وطني.\nمن أنا؟',
              'الأرزة — the Cedar'),

            open('Steal 100 Points Challenge!\n\nChallenge another team for the chance to steal 100 points! Each team chooses two players. All four players stand with their heads facing down and listen to three questions. For each question, the first player to raise their head and answer correctly earns one point. The team with the most points after all three questions wins and steals from the other team!\n\nThe challenge will be around Disney movies.',
              'Q1 — In Finding Nemo, what type of fish is Nemo? → Clownfish\nQ2 — In The Lion King, who is Simba’s evil uncle? → Scar\nQ3 — In Aladdin, what is the name of Princess Jasmine’s tiger? → Rajah'),

            open('You just saw seven seconds from a video regarding a famous Lebanese song. Can you guess its name?',
              'Kifik 3a Fra2e — Fadel Chaker',
              { media: vid('r3-q8-fadelchaker.mp4', { muted: true }) }),

            open('Plank Challenge!\n\nChoose three team members to hold a plank without moving while the rest of the team names five countries beginning with the letter L. If anyone drops before all five countries are named, the team loses the challenge!',
              'Possible answers: Lebanon, Libya, Laos, Latvia, Lithuania, Luxembourg, Liechtenstein'),
          ]),
        ],
      },
    ],
  };
}

/** A blank question, used when Board Size grows the grid. */
export function blankQuestion() {
  return { id: uid('q'), prompt: '', options: [], correct: -1, answer: '', label: '', media: null, done: false };
}

/** A blank category, used when Board Size adds a column. */
export function blankCategory(n = 1) {
  return cat(`Category ${n}`, '❓', '#9aa9c9', []);
}

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SENTENCES_FILE = path.join(ROOT, "sentences.js");
const TIP_DIR = path.join(ROOT, "pronunciation-tips");
const OUTPUT_FILE = path.join(ROOT, "pronunciation-tips.js");
const TOKEN_RE = /[A-Za-z]+(?:[’'][A-Za-z]+)?/g;

const FUNCTION_WORDS = new Set(
  [
    "a",
    "about",
    "after",
    "all",
    "am",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "because",
    "been",
    "but",
    "by",
    "can",
    "could",
    "did",
    "do",
    "does",
    "for",
    "from",
    "had",
    "has",
    "have",
    "he",
    "her",
    "him",
    "his",
    "how",
    "i",
    "if",
    "in",
    "into",
    "is",
    "it",
    "its",
    "just",
    "me",
    "more",
    "my",
    "of",
    "on",
    "or",
    "our",
    "she",
    "so",
    "some",
    "than",
    "that",
    "the",
    "their",
    "them",
    "there",
    "they",
    "this",
    "to",
    "up",
    "us",
    "was",
    "we",
    "were",
    "what",
    "when",
    "where",
    "which",
    "who",
    "why",
    "will",
    "with",
    "would",
    "you",
    "your",
  ].map((word) => word.toLowerCase()),
);

const WEAK_FORMS = new Map([
  ["a", "/ə/"],
  ["an", "/ən/"],
  ["and", "/ən/"],
  ["are", "/ər/"],
  ["can", "/kən/"],
  ["could", "/kəd/"],
  ["for", "/fər/"],
  ["from", "/frəm/"],
  ["have", "/əv/"],
  ["has", "/əz/"],
  ["of", "/əv/"],
  ["the", "/ðə/ または /ði/"],
  ["to", "/tə/"],
  ["was", "/wəz/"],
  ["were", "/wər/"],
  ["will", "/wəl/"],
  ["would", "/wəd/"],
]);

const guide = (ipa, mouth, trap, image, stress) => ({
  ipa,
  mouth,
  trap,
  image,
  stress,
});

const GUIDES = {
  automatic: guide(
    "/ˌɔːtəˈmætɪk/",
    "最初の Au- は唇を丸めた日本語の「オー」ではなく、口を縦に開けて「アー」と「オー」の中間を作ります。-ma- では口角を少し横に引き、あごをガクンと落として /æ/ を出します。",
    "「オートマチック」と四拍でそろえず、真ん中の t は柔らかいラ行・ダ行のように流し、いちばん強くするのは -ma- です。",
    "オー・ラ・メア・ティック ／ オーラメアティック",
    "-ma-",
  ),
  individual: guide(
    "/ˌɪndɪˈvɪdʒuəl/",
    "頭の In-di- は力を抜き、-vi- で唇を横に引いて強くします。最後は「ジュ・ア・ル」と区切らず、舌を軽く上あごへ寄せたまま /dʒuəl/ を一息で流します。",
    "「インディビジュアル」と五拍にせず、アクセントを -vi- に置き、語尾に余分な「ア」を足さないのがコツです。",
    "インディ・ヴィ・ジュル ／ インディヴィジュル",
    "-vi-",
  ),
  experiences: guide(
    "/ɪkˈspɪriənsɪz/",
    "ex- は「エックス」と広げず、口を小さくして /ɪk/。-spe- で口角を横に引き、最後の -s は /z/ を混ぜて軽く閉じます。",
    "「エクスペリエンシーズ」と全部の母音を同じ長さにせず、-spe- を山にして前後をすばやく添えます。",
    "イク・スピア・リエン・スィズ ／ イクスピアリエンスィズ",
    "-spe-",
  ),
  different: guide(
    "/ˈdɪfrənt/",
    "最初の /dɪf/ で短く口を横に引き、真ん中の r は舌をどこにも強く当てずに弱い /rə/。最後は /nt/ を「ントゥ」と開かず、舌先で止めます。",
    "「ディファレント」と三拍にせず、/dɪf-rənt/ の二つの山に圧縮します。最後に「ウ」を足さないでください。",
    "ディフ・レント ／ ディフレント",
    "dif-",
  ),
  general: guide(
    "/ˈdʒenrəl/",
    "最初の /dʒen/ で口角を横に引き、中央の母音は軽いシュワにします。最後の /rəl/ は舌を巻きすぎず、舌先を浮かせて短く閉じます。",
    "「ジェネラル」と四拍にせず、/dʒen-rəl/ の二つのまとまりで読むとカタカナ感が減ります。",
    "ジェン・ラル ／ ジェンラル",
    "gen-",
  ),
  trends: guide(
    "/trendz/",
    "tr- は「ト・ラ」と分けず、舌先を上の歯ぐきへ近づけて息を前へ擦らせます。語尾 /dz/ は声を残したまま、最後に母音を足さず閉じます。",
    "「トレンドゥ」と語尾を開かず、最後は /dz/ だけで止めます。複数の -s も一拍にしません。",
    "トレン(ズ) ／ トレンズ",
    "trends",
  ),
  teach: guide(
    "/tiːtʃ/",
    "長い /iː/ は日本語の「イー」と平らに伸ばさず、口角を横に引いて少し前へ響かせます。最後の /tʃ/ は「チ」と一拍で閉じます。",
    "「ティーチ」と母音を足して「チー・チュ」にしないよう、語尾の /tʃ/ を子音のまとまりとして止めます。",
    "ティー(ッ)チ ／ teach Japanese",
    "teach",
  ),
  japanese: guide(
    "/ˌdʒæpəˈniːz/",
    "最初の /dʒæ/ は口角を横に引いてあごを落とします。最後の -nese は /niːz/ を一番長くし、/z/ を声のまま閉じます。",
    "「ジャパニーズ」と四拍を均等にせず、-nese を中心にして頭を軽く添えます。",
    "ジャ・パ・ニーズ ／ ジャパニーズ",
    "-nese",
  ),
  teacher: guide(
    "/ˈtiːtʃər/",
    "teach の /iː/ は口角を横へ。語尾 -er は日本語の「アー」と伸ばさず、舌を軽く後ろへ引いた /ər/ で閉じます。",
    "「ティーチャー」と最後を強く伸ばさず、最初の teach を山にして -er を短く添えます。",
    "ティーチ・ァ ／ ティーチャ",
    "teach-",
  ),
  adult: guide(
    "/ˈædʌlt/",
    "最初の /æ/ は口角を横に引き、あごを下へ落とす「アとエの中間」です。最後の /lt/ は「ルトゥ」と開かず、舌先で /t/ を止めます。",
    "「アダルト」と日本語の「ル」を強く入れず、最初の /æ/ を短く明るく出します。",
    "ア(ェ)・ダルト ／ アェダルト",
    "ad-",
  ),
  learners: guide(
    "/ˈlɜːrnərz/",
    "l- は舌先を上の歯ぐきへ。-learn- の /ɜːr/ は口を縦に開け、舌を奥へ引きます。語尾 -ers は /ərz/ で小さくまとめます。",
    "「ラーナーズ」と母音を増やさず、learn を長めに保ち、最後の複数の /z/ を一拍にしません。",
    "ラーン・ァズ ／ ラーナーズ",
    "learn-",
  ),
  teaching: guide(
    "/ˈtiːtʃɪŋ/",
    "teach の /iː/ を口角を横へ引いて保ち、-ing は「イング」と二拍にせず、舌の奥を上げて /ɪŋ/ で鼻へ抜きます。",
    "語尾に「グ」を強く足さず、teach と -ing を滑らかに一つへまとめます。",
    "ティーチ・イン(グ) ／ ティーチング",
    "teach-",
  ),
  years: guide(
    "/jɪrz/",
    "y- の /j/ は日本語の「イ」を一拍にせず、舌を前へ滑らせて /ɪ/ へ入ります。最後の /rz/ は声を残して閉じます。",
    "「イヤーズ」と母音を二つに分けず、year を一息で出し、複数の /z/ を添えます。",
    "イ(ャ)ーズ ／ years",
    "years",
  ),
  english: guide(
    "/ˈɪŋɡlɪʃ/",
    "最初の /ɪ/ は短く、舌の奥を上げて /ŋ/ へ。-glish の /ɪ/ も日本語の「イー」と伸ばさず、最後の /ʃ/ を息で閉じます。",
    "「イングリッシュ」と五拍にせず、最初の English を短い二つのまとまりで流します。",
    "イン・グリシュ ／ イングリシュ",
    "Eng-",
  ),
  language: guide(
    "/ˈlæŋɡwɪdʒ/",
    "最初の /læŋ/ は口角を横に引いてあごを落とします。-guage は「グ・ウェ・ジ」と分けず、/ɡwɪdʒ/ を一息で。",
    "「ランゲージ」と日本語の母音を増やさず、最初の /læ/ と最後の /dʒ/ をはっきりします。",
    "ラン(グ)・ウィジ ／ ラングウィジ",
    "lan-",
  ),
  conversation: guide(
    "/ˌkɑːnvərˈseɪʃən/",
    "con- は弱く短く、-ver- の r は舌を軽く浮かせます。いちばん強い -sa- では口を横に引いて /eɪ/ を滑らせ、最後は /ʃən/。",
    "「カンバセーション」と全音節を同じ強さにせず、-sa- を山にして前半と語尾を軽くします。",
    "カン・ヴァ・セイ・ション ／ カンヴァセイション",
    "-sa-",
  ),
  natural: guide(
    "/ˈnætʃərəl/",
    "最初の /næ/ は口角を横に引いてあごを落とします。-tʃər- は「チャー」と伸ばさず、舌を軽く上あごへ寄せて流します。",
    "「ナチュラル」と四拍にせず、nat- を山にして後半を小さくまとめます。",
    "ナ(ェ)・チュラル ／ ナェチュラル",
    "nat-",
  ),
  sentence: guide(
    "/ˈsentəns/",
    "最初の /sen/ は口角を横に。-tence は「テンス」と母音を足さず、中央の /tə/ をシュワで軽く、最後の /ns/ で閉じます。",
    "「センテンス」と四拍にしないで、sen を強く、-təns を短く一まとまりにします。",
    "セン・トンス ／ センテンス",
    "sen-",
  ),
  different: guide(
    "/ˈdɪfrənt/",
    "最初の /dɪf/ で口を横に引き、-fr- は唇を軽く下の歯へ触れてすぐ r へ移ります。最後の /nt/ は舌先で止めます。",
    "「ディファレント」と三拍にせず、中央の母音を弱くして /dɪf-rənt/ に圧縮します。",
    "ディフ・レント ／ ディフレント",
    "dif-",
  ),
  explain: guide(
    "/ɪkˈspleɪn/",
    "ex- は短い /ɪk/。-plain の /eɪ/ は口を横に開いて「エ」から「イ」へ滑らせ、最後の /n/ は舌先で閉じます。",
    "「イクスプレイン」と子音の間に母音を入れず、/kspl/ を一息でつなぎます。",
    "イク・スプレイン ／ イクスプレイン",
    "-plain",
  ),
  feedback: guide(
    "/ˈfiːdbæk/",
    "fee- は口角を横に引いて長めの /iː/。back の /æ/ はあごを落とし、最後の /k/ は息を止めるだけにします。",
    "「フィードバック」と平らに読まず、fee と back の二つの山を作り、間に余分な母音を入れません。",
    "フィード・バェック ／ フィードバェック",
    "feed-",
  ),
  thoughtful: guide(
    "/ˈθɔːtfəl/",
    "th は舌先を上下の歯の間に少し出し、息を擦らせます。-thought- の /ɔː/ は口を縦に開け、語尾 -ful は /fəl/ で軽く。",
    "「ソートフル」と th を日本語の「サ行」に置き換えず、最後の「ウ」を足さないのがポイントです。",
    "スォート・フル ／ スォートフル",
    "thought-",
  ),
  improve: guide(
    "/ɪmˈpruːv/",
    "im- は短く、pr- は唇を閉じてすぐ r へ。-prove の /uː/ は唇を丸めすぎず、最後の /v/ は下唇を軽く噛んで声を残します。",
    "「インプルーブ」と母音を足さず、/mpr/ を一塊にして -prove を強くします。",
    "イム・プルーヴ ／ インプルーヴ",
    "-prove",
  ),
  pronunciation: guide(
    "/prəˌnʌnsiˈeɪʃən/",
    "pro- は弱く、-nun- の /ʌ/ は口を縦に少し開けます。-ciation の /eɪ/ を山にし、最後の /ʃən/ は軽く閉じます。",
    "「プロナウンシエーション」と全部を均等にせず、-eɪ- を中心に前後を圧縮します。",
    "プロ・ナン・スィ・エイ・ション ／ プロナンスエイション",
    "-eɪ-",
  ),
  rhythm: guide(
    "/ˈrɪðəm/",
    "最初の r は舌をどこにも付けず、/rɪ/ を短く。th は舌先を歯の間に出し、最後の /əm/ は軽く鼻へ抜きます。",
    "「リズム」と子音を日本語の「ズ」にしすぎず、二音節を一つの波にします。",
    "リ(舌を浮かせる)・ズム ／ リズム",
    "rhyth-",
  ),
  stress: guide(
    "/stres/",
    "st- は「ス・ト」と分けず、舌先を上の歯ぐきへ近づけて息をまとめます。最後の /s/ は声を消して閉じます。",
    "「ストレス」と二拍にしたり語尾に「ウ」を足したりせず、/str/ を一息で出します。",
    "スト(一息)レス ／ ストレス",
    "stress",
  ),
  practice: guide(
    "/ˈpræktɪs/",
    "最初の /præ/ は唇を閉じてから口角を横へ、あごを落とします。-tice の /ɪs/ は短く、最後の /s/ で閉じます。",
    "「プラクティス」と三拍にせず、prac- を山にして後半を素早く添えます。",
    "プラェク・ティス ／ プラェクティス",
    "prac-",
  ),
  experience: guide(
    "/ɪkˈspɪriəns/",
    "ex- は小さな /ɪk/、-spe- で口角を横へ。語尾 -ence は「エンス」と広げず、/əns/ を軽く閉じます。",
    "「エクスペリエンス」とすべての母音を並べず、-spe- を山にします。",
    "イク・スピア・リエンス ／ イクスピアリエンス",
    "-spe-",
  ),
  mistake: guide(
    "/mɪˈsteɪk/",
    "mis- は短く、-take の /eɪ/ は「エ」から「イ」へ滑らせます。最後の /k/ は息を止めて終わります。",
    "「ミステイク」と日本語の「テ」を独立させず、/st/ を一息にして take を強くします。",
    "ミス・テイク ／ ミステイク",
    "-take",
  ),
  without: guide(
    "/wɪˈðaʊt/",
    "with- の th は舌先を歯の間に少し出して声を出します。-out は口を縦に開けて /aʊ/ を「ア」から「ウ」へ滑らせます。",
    "「ウィズアウト」と子音の間に余分な母音を入れず、-out を一つの滑る母音にします。",
    "ウィ(ズ)・アウ(ト) ／ ウィザウト",
    "-out",
  ),
  understand: guide(
    "/ˌʌndərˈstænd/",
    "under- は軽く、最後の -stand で口角を横に引き、あごを落とす /æ/。st は「ス・ト」と分けません。",
    "「アンダースタンド」と全部を同じ強さにせず、-stand を大きな山にします。",
    "アン・ダ・スタェンド ／ アンダスタェンド",
    "-stand",
  ),
  important: guide(
    "/ɪmˈpɔːrtənt/",
    "im- は短く、-por- では口を縦に開けて響かせます。最後の -tant は /tənt/ と弱く、語尾に「トゥ」を足しません。",
    "「インポータント」と四拍にせず、-por- を強く、最後を小さくまとめます。",
    "イム・ポール・トント ／ インポータント",
    "-por-",
  ),
  specific: guide(
    "/spəˈsɪfɪk/",
    "最初の sp は子音をまとめ、-ci- で口角を横へ。最後の /ɪk/ は「イク」と母音を伸ばさず短く閉じます。",
    "「スペシフィック」と全音節を均等にせず、-sif- を一番強くします。",
    "スプ・スィフ・イク ／ スプスィフィク",
    "-sif-",
  ),
  clearly: guide(
    "/ˈklɪrli/",
    "cl- は舌先を上の歯ぐきへ置く l へすぐ移ります。clear の /ɪr/ は舌を浮かせ、最後の -ly は /li/ で軽く。",
    "「クリアリー」と「ア」を一拍足さず、clear と -ly を滑らかに結びます。",
    "クリア(舌を浮かせる)・リ ／ クリアリー",
    "clear-",
  ),
  smoothly: guide(
    "/ˈsmuːðli/",
    "sm- は唇を閉じて一息に。-mooth- の /uː/ は唇を丸めすぎず、th は舌先を歯の間に出して声を残します。",
    "「スムースリー」と th を「ス」にせず、smooth と -ly の境目を切りません。",
    "スムー(ズ)・リ ／ スムーズリー",
    "smooth-",
  ),
  especially: guide(
    "/ɪˈspeʃəli/",
    "最初の i- は短く、-spe- で口角を横へ。最後の -cially は /ʃəli/ と小さく流し、母音を一つずつ立てません。",
    "「エスペシャリー」と先頭に余分な「エ」を足さず、-spe- を山にします。",
    "イ・スペ・シャ・リ ／ イスペシャリ",
    "-spe-",
  ),
  usually: guide(
    "/ˈjuːʒuəli/",
    "最初の /juː/ は「ユ」を一拍で出し、/ʒ/ は舌を歯に付けず声を擦らせます。語尾は /əli/ と軽く。",
    "「ユージュアリー」と区切らず、最初の you を山にして後半をなめらかにします。",
    "ユー・ジュ・ア・リ ／ ユージュアリ",
    "u-",
  ),
  actually: guide(
    "/ˈæktʃuəli/",
    "最初の /æk/ は口角を横へ、あごを落とします。-tually は /tʃuəli/ と「チュ・ア・リ」を切らずに流します。",
    "「アクチュアリー」と全音節を同じ長さにせず、最初の /æk/ を山にします。",
    "アェク・チュ・ア・リ ／ アェクチュアリ",
    "ac-",
  ),
  probably: guide(
    "/ˈprɑːbəbli/",
    "最初の /prɑː/ は唇を閉じてから口を縦に開けます。中央の /bə/ はシュワで弱く、最後は /bli/ へ一息に。",
    "「プロバブリー」と四拍にせず、最初の prob- を山にして真ん中の母音を軽くします。",
    "プロ・バ・ブリ ／ プロバブリ",
    "prob-",
  ),
  future: guide(
    "/ˈfjuːtʃər/",
    "f- は下唇に上の歯を軽く当て、/juː/ へ滑らせます。語尾 -ture は /tʃər/ と閉じ、最後に「ア」を足しません。",
    "「フューチャー」と母音を伸ばしすぎず、最初の future を山、語尾を軽い /ər/ にします。",
    "フュー・チャ ／ フューチャ",
    "fu-",
  ),
  people: guide(
    "/ˈpiːpəl/",
    "最初の /piː/ は口角を横へ。-ple は l の舌先を上の歯ぐきへ置き、最後の /əl/ は「ル」と開かず軽く閉じます。",
    "「ピープル」と二拍を同じ強さにせず、語尾の「ル」に余分な母音を足しません。",
    "ピー・プル ／ ピープル",
    "peo-",
  ),
  students: guide(
    "/ˈstuːdənts/",
    "st- は子音をまとめ、/uː/ は唇を丸めすぎないように。最後の /dnts/ は「デンツ」と開かず、舌先で小さく閉じます。",
    "「スチューデンツ」と母音を増やさず、最初の /stuː/ を山にします。",
    "スチュー・デン(ツ) ／ スチューデンツ",
    "stu-",
  ),
  question: guide(
    "/ˈkwestʃən/",
    "qu- は /k/ の直後に唇を丸めて /w/ へ。-tion は /ʃən/ と一息で、最後の n に母音を足しません。",
    "「クエスチョン」と四拍にせず、最初の /kwes/ を強く、-tion を軽く添えます。",
    "クウェス・チョン ／ クウェスチョン",
    "ques-",
  ),
  answer: guide(
    "/ˈænsər/",
    "最初の /æ/ は口角を横へ、あごを落とします。語尾 -ser は /sər/ と短く、r で舌をどこにも付けません。",
    "「アンサー」と最後を「サー」と伸ばさず、最初の /æn/ を山にします。",
    "アェン・サ ／ アェンサー",
    "an-",
  ),
  examples: guide(
    "/ɪɡˈzæmpəlz/",
    "ex- は短い /ɪɡ/。-sam- の /æ/ であごを落とし、語尾 -ples は /pəlz/ と軽くまとめます。",
    "「イグザンプルズ」と全部を均等にせず、-sam- を山にして複数の /z/ は一拍にしません。",
    "イグ・ザェム・プルズ ／ イグザェンプルズ",
    "-sam-",
  ),
  expression: guide(
    "/ɪkˈspreʃən/",
    "ex- は /ɪk/ と小さく、-press- の /e/ で口角を横へ。-sion は /ʃən/ と息をすぼめ、母音を足さず閉じます。",
    "「エクスプレッション」と四拍にせず、/kspr/ を一息にして -press- を山にします。",
    "イク・スプレ・ション ／ イクスプレション",
    "-press-",
  ),
  vocabulary: guide(
    "/vəˈkæbjəleri/",
    "vo- は弱い /və/、-cab- の /æ/ であごを落とします。語尾は /ləri/ と軽く流し、各母音を独立させません。",
    "「ボキャブラリー」と日本語の「ボ」を強くしすぎず、-cab- を中心に前後を圧縮します。",
    "ヴァ・キャブ・ラ・リ ／ ヴァキャブラリ",
    "-cab-",
  ),
  grammar: guide(
    "/ˈɡræmər/",
    "最初の /ɡræ/ は口角を横に引き、あごを落とします。語尾 -mar は /mər/ とシュワで軽く。",
    "「グラマー」と最後を「マー」と伸ばさず、最初の /ɡræm/ を一番強くします。",
    "グラェム・ァ ／ グラェマ",
    "gram-",
  ),
  collocation: guide(
    "/ˌkɑːləˈkeɪʃən/",
    "col- は軽く、-ca- の /keɪ/ で口を横へ滑らせます。最後の /ʃən/ は「ション」と母音を増やさず閉じます。",
    "「コロケーション」と均等に読まず、-ca- を山にして前後を弱くします。",
    "カ・ラ・ケイ・ション ／ カラケイション",
    "-ca-",
  ),
  important: guide(
    "/ɪmˈpɔːrtənt/",
    "im- は短く、-por- では口を縦に開けて響かせます。最後の -tant は /tənt/ と弱くまとめます。",
    "「インポータント」と四拍にせず、-por- を強く、語尾の「ト」を開きません。",
    "イム・ポール・トント ／ インポータント",
    "-por-",
  ),
  clear: guide(
    "/klɪr/",
    "cl- は舌先を上の歯ぐきへすばやく置き、r は舌を浮かせます。/ɪr/ を「クリ・ア」と二拍にしません。",
    "「クリア」と語尾に日本語の「ア」を足さず、子音のまま一息で閉じます。",
    "クリ(舌を浮かせる) ／ クリア",
    "clear",
  ),
  useful: guide(
    "/ˈjuːsfəl/",
    "use- の /juː/ は唇を丸めすぎず、最後の -ful は /fəl/ と軽く。f は下唇に上の歯を触れさせます。",
    "「ユースフル」と語尾を「フル」と二拍にせず、use を山にして /fəl/ を添えます。",
    "ユース・フル ／ ユースフル",
    "use-",
  ),
  communicate: guide(
    "/kəˈmjuːnɪkeɪt/",
    "最初の /kə/ は軽く、-mu- で唇を丸めて /juː/ へ。-cate の /eɪ/ を滑らせ、最後の t は破裂させすぎません。",
    "「コミュニケート」と全音節を均等にせず、-mu- と -cate を山にして前半を圧縮します。",
    "ク・ミュー・ニ・ケイト ／ コミュニケイト",
    "-mu- / -cate",
  ),
  communication: guide(
    "/kəˌmjuːnɪˈkeɪʃən/",
    "com- は軽く、-mu- の /uː/ で唇をすぼめます。-ca- の /eɪ/ を一番強くし、最後は /ʃən/ で閉じます。",
    "「コミュニケーション」と均等に伸ばさず、-ca- を山、語尾を小さくします。",
    "ク・ミュー・ニ・ケイ・ション ／ コミュニケイション",
    "-ca-",
  ),
  explanation: guide(
    "/ˌɛkspləˈneɪʃən/",
    "ex- は短く、-pla- は唇を閉じてすぐ l へ。-na- の /eɪ/ を山にし、最後は /ʃən/ と軽く閉じます。",
    "「エクスプラネーション」と母音を一つずつ足さず、/kspl/ をまとめて前半を圧縮します。",
    "イクス・プラ・ネイ・ション ／ イクスプラネイション",
    "-na-",
  ),
  listening: guide(
    "/ˈlɪsənɪŋ/",
    "最初の /lɪs/ は舌先を上の歯ぐきへ。-ten- は /tən/ と軽く、最後の -ing は鼻へ抜いて終わります。",
    "「リスニング」と三拍を均等にせず、lis- を山にして二つの -ing を軽くつなぎます。",
    "リス・ニング ／ リスニング",
    "lis-",
  ),
  language: guide(
    "/ˈlæŋɡwɪdʒ/",
    "最初の /læ/ は口角を横へ、あごを落とします。/ŋɡw/ を一息にし、最後の /dʒ/ は「ジ」と母音を伸ばさず閉じます。",
    "「ランゲージ」と三拍にせず、最初の /læŋ/ を山にします。",
    "ラェング・ウィジ ／ ラェングウィジ",
    "lan-",
  ),
  thoughtful: guide(
    "/ˈθɔːtfəl/",
    "th は舌先を歯の間に少し出し、息を擦らせます。thought の /ɔː/ は口を縦に開け、-ful は /fəl/ と弱く。",
    "「ソートフル」と th を「ソ」にせず、最後に「ウ」を足さないでください。",
    "スォート・フル ／ スォートフル",
    "thought-",
  ),
};

function normalize(word) {
  return word.toLowerCase().replace(/[’']/g, "");
}

function readSentences() {
  const source = fs.readFileSync(SENTENCES_FILE, "utf8");
  const match = source.match(/window\.SENTENCES\s*=\s*(\[[\s\S]*\]);\s*$/);
  if (!match) throw new Error("sentences.js の配列を読み取れません。");
  const sentences = Function("return (" + match[1] + ");")();
  if (!Array.isArray(sentences)) throw new Error("sentences.js が配列ではありません。");
  return sentences;
}

function readOldTips() {
  const oldWindow = { PRONUNCIATION_TIPS: {} };
  const files = fs
    .readdirSync(TIP_DIR)
    .filter((file) => /^pronunciation-tips-\d+\.js$/.test(file))
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));

  for (const file of files) {
    const source = fs.readFileSync(path.join(TIP_DIR, file), "utf8");
    vm.runInNewContext(source, { window: oldWindow }, { filename: file });
  }
  return oldWindow.PRONUNCIATION_TIPS;
}

function tokenObjects(sentence) {
  return (sentence.match(TOKEN_RE) || []).map((word) => ({
    word,
    norm: normalize(word),
  }));
}

function syllableHint(word) {
  const lower = normalize(word);
  if (lower.length <= 4) return "短い一まとまり";
  const groups = lower.match(/[aeiouy]+/g);
  const count = Math.max(1, groups ? groups.length : 1);
  return count >= 3 ? "音節を圧縮したまとまり" : "二つほどの音のまとまり";
}

function fallbackGuide(word) {
  const lower = normalize(word);
  let mouth =
    "口を日本語の一拍ぶん開けたままにせず、母音を短く、次の子音へすぐ移します。";
  let trap =
    "カタカナのように音節を一つずつ同じ長さで置くと、母音が増えて聞こえやすくなります。";
  let image = word + " をゆっくり、子音を意識して ／ " + word + " を一息で";
  let stress = word;

  if (/[th]/.test(lower)) {
    mouth =
      "th では舌先を上下の歯の間に少し出し、息を擦らせます。前後の母音へすぐ戻します。";
    trap =
      "th を日本語の「サ行」や「ザ行」だけで置き換えず、舌先を見せる時間をほんの少し作ります。";
  } else if (lower.includes("r")) {
    mouth =
      "r では舌先をどこにも付けず、舌を少し後ろへ引きます。口の中を固めず、次の母音へ滑らせます。";
    trap =
      "日本語のラ行のように舌先を弾くと音が途切れます。舌を浮かせたまま一息でつなぎます。";
  } else if (lower.includes("l")) {
    mouth =
      "l では舌先を上の歯ぐきへ軽く当て、すぐ離します。語尾なら舌先を置いたまま母音を足さずに閉じます。";
    trap =
      "ラ行のように毎回「ラ・リ・ル」と母音を足さず、舌先の接触だけを短く作ります。";
  } else if (lower.includes("v")) {
    mouth =
      "v では下唇に上の歯を軽く当て、声を残して擦らせます。b のように両唇を閉じ切らないのがポイントです。";
    trap =
      "「ブ」と両唇を閉じて終わらせず、下唇と上の歯の摩擦を一瞬残します。";
  } else if (lower.endsWith("ed")) {
    mouth =
      "語尾 -ed はいつも「エッド」と一拍にせず、前の音につなげて最後の子音だけを短く添えます。";
    trap =
      "日本語の「エド」を足すと音節が増えます。語尾は一拍増やさず、声を止めるか /d/ を軽く添えます。";
  } else if (lower.endsWith("s") || lower.endsWith("es")) {
    mouth =
      "語尾の -s は母音を足さず、息だけの /s/ か声を残す /z/ で閉じます。";
    trap =
      "「ス」「ズ」を独立した一拍にしないことが大切です。最後の子音を前の母音にそのまま重ねます。";
  } else if (lower.length >= 6) {
    mouth =
      "強くする音だけ口をしっかり動かし、前後は口の力を抜いて短くします。音節を全部同じ大きさにしません。";
    trap =
      "カタカナ読みのように母音を並べると長くなります。語の山を一つ決め、残りを小さくまとめます。";
  }

  if (lower.length >= 7) {
    stress = lower.slice(0, Math.ceil(lower.length / 2));
  }
  return {
    ipa: "",
    mouth,
    trap,
    image,
    stress,
  };
}

function getGuide(word) {
  return GUIDES[normalize(word)] || fallbackGuide(word);
}

function oldFocusWords(oldText, tokens) {
  if (!oldText) return [];
  const quoted = oldText.match(/「([^」]+)」/);
  if (!quoted) return [];
  const candidates = quoted[1]
    .split(/[／/]/)
    .map((word) => normalize(word))
    .filter(Boolean);
  return candidates
    .map((candidate) => tokens.find((token) => token.norm === candidate))
    .filter(Boolean);
}

function chooseFocus(tokens, oldText) {
  const old = oldFocusWords(oldText, tokens);
  const selected = [];
  for (const token of old) {
    if (!selected.some((item) => item.norm === token.norm)) selected.push(token);
  }

  const ranked = tokens
    .map((token, index) => {
      const known = Boolean(GUIDES[token.norm]);
      const functionPenalty = FUNCTION_WORDS.has(token.norm) ? -16 : 0;
      const lengthScore = Math.min(token.norm.length, 10);
      const multiScore = token.norm.length >= 7 ? 7 : 0;
      const oldScore = old.some((item) => item.norm === token.norm) ? 25 : 0;
      return {
        token,
        index,
        score: (known ? 40 : 0) + oldScore + functionPenalty + lengthScore + multiScore,
      };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const max = tokens.length >= 8 ? 3 : 2;
  for (const item of ranked) {
    if (selected.length >= max) break;
    if (!selected.some((token) => token.norm === item.token.norm)) selected.push(item.token);
  }

  if (selected.length === 0 && tokens.length > 0) selected.push(tokens[0]);
  return selected;
}

function nearbyPhrase(tokens, focus, radius = 2) {
  const index = tokens.findIndex((token) => token.norm === focus.norm);
  if (index < 0) return focus.word;
  const start = Math.max(0, index - radius);
  const end = Math.min(tokens.length, index + radius + 1);
  return tokens.slice(start, end).map((token) => token.word).join(" ");
}

function chooseAdjacentPair(tokens, focus) {
  const focusIndex = focus.length
    ? tokens.findIndex((token) => token.norm === focus[0].norm)
    : -1;
  const candidates = [];
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const left = tokens[index];
    const right = tokens[index + 1];
    let score = 0;
    if (WEAK_FORMS.has(right.norm)) score += 18;
    if (/[aeiou]/.test(right.norm[0] || "")) score += 7;
    if (/[tdkgpsfvzmnrl]$/.test(left.norm)) score += 3;
    if (index === focusIndex || index + 1 === focusIndex) score += 10;
    score -= Math.abs(index - Math.max(focusIndex, 0));
    candidates.push({ left, right, index, score });
  }
  if (candidates.length === 0) {
    return {
      left: tokens[0] || { word: "This", norm: "this" },
      right: tokens[0] || { word: "sentence", norm: "sentence" },
      index: 0,
    };
  }
  candidates.sort((a, b) => b.score - a.score || a.index - b.index);
  return candidates[0];
}

function chunkAroundPair(tokens, pair) {
  if (tokens.length <= 2) return tokens.map((token) => token.word).join(" ／ ");
  const split = Math.max(1, Math.min(tokens.length - 1, pair.index + 1));
  return (
    tokens.slice(0, split).map((token) => token.word).join(" ") +
    " ／ " +
    tokens.slice(split).map((token) => token.word).join(" ")
  );
}

function makeFocusText(sentence, tokens, focus) {
  const names = focus.map((token) => "「" + token.word + "」").join("・");
  const details = focus
    .map((token) => {
      const info = getGuide(token.word);
      const ipa = info.ipa ? " " + info.ipa : "";
      return (
        token.word +
        ipa +
        "： " +
        info.mouth +
        " " +
        info.trap +
        " 強くする場所は「" +
        info.stress +
        "」です。"
      );
    })
    .join("\n");
  const firstPhrase = focus.length ? nearbyPhrase(tokens, focus[0], 2) : sentence;
  const secondPhrase = focus.length > 1 ? nearbyPhrase(tokens, focus[1], 1) : firstPhrase;
  const image = focus
    .map((token) => getGuide(token.word).image)
    .join(" ／ ");
  return (
    "この文では " +
    names +
    " を主役にします。日本語の一拍ずつの読み方から離れ、強いところだけ口をしっかり動かして、残りは次の音へ早めに渡します。\n" +
    details +
    "\n練習用イメージ：ゆっくり「" +
    image +
    "」／自然な会話では「" +
    firstPhrase +
    "」を一息で。もう一度、「" +
    secondPhrase +
    "」を意味のまとまりとして言ってみてください。\nフレーズでの練習例：" +
    firstPhrase +
    "。"
  );
}

function makeAccentText(sentence, focus) {
  const details = focus
    .map((token) => {
      const info = getGuide(token.word);
      return (
        "「" +
        token.word +
        "」は、" +
        info.trap +
        " " +
        info.mouth +
        " "
      );
    })
    .join("");
  return (
    "日本語では一つ一つの音を同じ長さで置きやすいので、この文では「" +
    focus.map((token) => token.word).join("」「") +
    "」の山を先に決めます。\n" +
    details +
    "迷ったら、まず母音を増やさず子音を次の音へつなげ、強い音と弱い音の差を少し大きくしてください。"
  );
}

function makeLinkText(sentence, tokens, pair) {
  const leftInfo = getGuide(pair.left.word);
  const rightWeak = WEAK_FORMS.get(pair.right.norm);
  const rightAdvice = rightWeak
    ? "「" + pair.right.word + "」は会話では " + rightWeak + " に近い弱形にすると、文の流れが自然になります。"
    : "「" + pair.right.word + "」の最初の音へ、口を止めずに移ります。";
  const leftEnd = leftInfo.trap.includes("語尾")
    ? "語尾を開かず"
    : "「" + pair.left.word + "」の最後を一拍にせず";
  const chunk = chunkAroundPair(tokens, pair);
  return (
    "文中では " +
    pair.left.word +
    " ／ " +
    pair.right.word +
    " を別々に置かず、" +
    leftEnd +
    "、そのまま「" +
    pair.right.word +
    "」へ息を渡します。" +
    rightAdvice +
    "練習では「" +
    pair.left.word +
    " ／ " +
    pair.right.word +
    "」だけを三回つなげ、全文は「" +
    chunk +
    "」の区切りで読みます。"
  );
}

function makeRhythmText(sentence, tokens, focus, pair) {
  const content = focus.map((token) => token.word).join("・");
  const weak = tokens
    .filter((token) => FUNCTION_WORDS.has(token.norm))
    .slice(0, 4)
    .map((token) => token.word)
    .join("・");
  const chunk = chunkAroundPair(tokens, pair);
  return (
    "英語では「" +
    content +
    "」のような内容語を少し長く、高く、はっきり出します。一方、「" +
    (weak || "短い機能語") +
    "」は口の力を抜いて、内容語の間にすばやく収めます。\n" +
    "日本語のように全部を同じ強さで読まず、「" +
    chunk +
    "」を一つの波にしてください。最後の内容語で声を落ち着かせると、文の終わりまで急に弱くなりません。"
  );
}

function makeStageText(sentence, tokens, focus, pair) {
  const focusPhrase = focus.length ? nearbyPhrase(tokens, focus[0], 2) : sentence;
  const chunk = chunkAroundPair(tokens, pair);
  return (
    "1. 意味：まず「" +
    sentence +
    "」を、内容を思い浮かべながらゆっくり一度。\n" +
    "2. 音：「" +
    focusPhrase +
    "」だけを取り出し、口の形と「" +
    pair.left.word +
    " ／ " +
    pair.right.word +
    "」のつながりを三回練習します。\n" +
    "3. 会話：最後に「" +
    chunk +
    "」のまとまりを保ったまま、録音するつもりの自然な速さで全文を言います。録音後は、語尾に「ウ」「オ」「イ」を足していないか、強い語が埋もれていないかだけ確認してください。"
  );
}

function buildRecords(sentences, oldTips) {
  const records = {};
  for (const sentence of sentences) {
    const tokens = tokenObjects(sentence.text);
    const oldFocusText = (oldTips[String(sentence.id)] || [])
      .find((item) => item.label === "重点語の口の形")?.text;
    const focus = chooseFocus(tokens, oldFocusText);
    const pair = chooseAdjacentPair(tokens, focus);
    records[String(sentence.id)] = [
      {
        label: "重点語の口の形",
        text: makeFocusText(sentence.text, tokens, focus),
      },
      {
        label: "日本語訛りになりやすい音",
        text: makeAccentText(sentence.text, focus),
      },
      {
        label: "音のつながり",
        text: makeLinkText(sentence.text, tokens, pair),
      },
      {
        label: "英語のリズム",
        text: makeRhythmText(sentence.text, tokens, focus, pair),
      },
      {
        label: "段階練習",
        text: makeStageText(sentence.text, tokens, focus, pair),
      },
    ];
  }
  return records;
}

function normalizedText(text) {
  return text.replace(/\s+/g, " ").trim();
}

function validate(records, sentences) {
  const labels = [
    "重点語の口の形",
    "日本語訛りになりやすい音",
    "音のつながり",
    "英語のリズム",
    "段階練習",
  ];
  if (sentences.length !== 300) {
    throw new Error("例文数が300ではありません: " + sentences.length);
  }
  const seen = new Set();
  const adjacentPattern =
    /文中では\s+([A-Za-z][A-Za-z’'-]*)\s*／\s*([A-Za-z][A-Za-z’'-]*)/;
  for (const sentence of sentences) {
    const items = records[String(sentence.id)];
    if (!items || items.length !== labels.length) {
      throw new Error("ID " + sentence.id + " の項目数が5ではありません。");
    }
    const sentenceTokens = tokenObjects(sentence.text).map((token) => token.norm);
    for (const item of items) {
      if (!labels.includes(item.label)) {
        throw new Error("ID " + sentence.id + " に不明なラベルがあります。");
      }
      const key = normalizedText(item.text);
      if (seen.has(key)) {
        throw new Error("説明文が重複しています: " + item.label + " / ID " + sentence.id);
      }
      seen.add(key);
      if (item.text.includes("→")) {
        throw new Error("矢印記号が残っています: ID " + sentence.id);
      }
      if (/は短く弱く発音し、/.test(item.text)) {
        throw new Error("内容語を弱くする定型文が残っています: ID " + sentence.id);
      }
      if (item.label === "音のつながり") {
        const match = item.text.match(adjacentPattern);
        if (!match) throw new Error("隣接語の形式がありません: ID " + sentence.id);
        const index = sentenceTokens.findIndex(
          (token, tokenIndex) =>
            token === normalize(match[1]) &&
            sentenceTokens[tokenIndex + 1] === normalize(match[2]),
        );
        if (index < 0) {
          throw new Error(
            "実際の隣接語ではありません: ID " +
              sentence.id +
              " / " +
              match[1] +
              " ／ " +
              match[2],
          );
        }
      }
    }
  }
  const count = Object.keys(records).length;
  if (count !== 300) throw new Error("レコード数が300ではありません: " + count);
  return { itemCount: seen.size, uniqueCount: seen.size };
}

function serialized(records) {
  return (
    "// Generated by tools/review-pronunciation-feedback.mjs. Do not edit by hand.\n" +
    "Object.assign(window.PRONUNCIATION_TIPS, " +
    JSON.stringify(records, null, 2) +
    ");\n"
  );
}

const shouldWrite = process.argv.includes("--write");
const sentences = readSentences();
const oldTips = readOldTips();
const records = buildRecords(sentences, oldTips);
const stats = validate(records, sentences);

if (shouldWrite) {
  fs.writeFileSync(OUTPUT_FILE, serialized(records), "utf8");
  console.log(
    "pronunciation-tips.js を更新しました: " +
      sentences.length +
      "例文 / " +
      stats.itemCount +
      "件の説明文",
  );
} else {
  console.log(
    "dry-run: " +
      sentences.length +
      "例文 / " +
      stats.itemCount +
      "件の説明文。書き込む場合は --write を付けてください。",
  );
}

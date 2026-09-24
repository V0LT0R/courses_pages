import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const generatorFile = path.join(
  __dirname,
  "generate-training-certificate.js"
);

const participants = [
  {
    lastName: "Баяндин",
    firstName: "Марат Асылбекович",
  },
  {
    lastName: "Баяндина",
    firstName: "Гульмира Дуйсенбаевна",
  },
  {
    lastName: "Кадырова",
    firstName: "Акмарал Сатбековна",
  },
  {
    lastName: "Куатбеков",
    firstName: "Жарас Алпысбаевич",
  },
  {
    lastName: "Наренова",
    firstName: "Айман Нурмаганбетовна",
  },
  {
    lastName: "Есперов",
    firstName: "Елдос Избасарович",
  },
  {
    lastName: "Саркулова",
    firstName: "Жанар Жақсыбаевна",
  },
  {
    lastName: "Тастанбекова",
    firstName: "Қарлығаш Нышанбаевна",
  },
  {
    lastName: "Нургабылов",
    firstName: "Мурат Нуридинович",
  },
  {
    lastName: "Сарсенова",
    firstName: "Ақмарал Едильбаевна",
  },
  {
    lastName: "Шілдебайұлы",
    firstName: "Сағадат",
  },
  {
    lastName: "Хасан",
    firstName: "Адил",
  },
  {
    lastName: "Бейсенбай",
    firstName: "Сынбат",
  },
  {
    lastName: "Жүсіп",
    firstName: "Айжан",
  },
  {
    lastName: "Сариева",
    firstName: "Жазира",
  },
  {
    lastName: "Мүсірәлі",
    firstName: "Мадина",
  },
  {
    lastName: "Байшымыр",
    firstName: "Нұрсұлтан",
  },
  {
    lastName: "Орынбасар",
    firstName: "Нұрай",
  },
  {
    lastName: "Нұржанқызы",
    firstName: "Нұрай",
  },
  {
    lastName: "Жәутікқызы",
    firstName: "Айлара",
  },
  {
    lastName: "Ермекова",
    firstName: "А.С",
  },
  {
    lastName: "Жақсылық",
    firstName: "Аружан",
  },
  {
    lastName: "Базаралы",
    firstName: "Биғайша",
  },
  {
    lastName: "Жұмабай",
    firstName: "Аяжан",
  },
  {
    lastName: "Нұрғали",
    firstName: "Мадина",
  },
  {
    lastName: "Аманалы",
    firstName: "Айдана",
  },
  {
    lastName: "Утепберген",
    firstName: "Әсел",
  },
  {
    lastName: "Жеңіс",
    firstName: "Нұрдана",
  },
  {
    lastName: "Бахболат",
    firstName: "Әділ",
  },
  {
    lastName: "Досмаилов",
    firstName: "Имран",
  },
  {
    lastName: "Сүгірбай",
    firstName: "Азамат",
  },
  {
    lastName: "Касым",
    firstName: "Мансур",
  },
  {
    lastName: "Бешлиоглы",
    firstName: "Мансур",
  },
  {
    lastName: "Кеңес",
    firstName: "Назерке",
  },
  {
    lastName: "Жаппар",
    firstName: "Ақмоншақ",
  },
];

let successful = 0;
let failed = 0;

console.log(
  `\nНачинается создание ${participants.length} сертификатов.\n`
);

for (
  let index = 0;
  index < participants.length;
  index++
) {
  const participant = participants[index];

  const fullName =
    `${participant.lastName} ${participant.firstName}`;

  console.log(
    `\n[${index + 1}/${participants.length}] ${fullName}`
  );

  const result = spawnSync(
    process.execPath,
    [
      generatorFile,
      participant.lastName,
      participant.firstName,
    ],
    {
      encoding: "utf8",
      stdio: "inherit",
    }
  );

  if (result.error) {
    failed++;

    console.error(
      `Не удалось запустить генератор для: ${fullName}`
    );

    console.error(result.error.message);

    continue;
  }

  if (result.status !== 0) {
    failed++;

    console.error(
      `Ошибка создания сертификата: ${fullName}`
    );

    continue;
  }

  successful++;
}

console.log(
  "\n========================================"
);

console.log("Генерация завершена.");

console.log(
  `Успешно создано: ${successful}`
);

console.log(
  `Ошибок: ${failed}`
);

console.log(
  "Папка: generated-certificates"
);

console.log(
  "Реестр: generated-certificates/certificates_registry.csv"
);

console.log(
  "========================================\n"
);

if (failed > 0) {
  process.exitCode = 1;
}
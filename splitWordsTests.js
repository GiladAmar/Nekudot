let testStrings = ['This is a test',
    'This is a test.',
    'This is a test. And this.',
    'test',
    'test.',
    'הם חלק ממאמצי האגודה הלאומית',
    '.הם חלק ממאמצי האגודה הלאומית',
    'הם חלק ממאמצי האגודה הלאומית.',
    'האגודה',
    'האגודה.',
    '.האגודה',
    'האגודהTest',
    'האגודה.Test',
    'Testהאגודה',
    'Test.האגודה',
    'Testהאגודה.',
    'הם חלק ממאמצי האגודה הלאומית. This is a test.',
    'הם חלק ממאמצי האגודה הלאומית. This is a test',
    'הם חלק ממאמצי האגודה הלאומית This is a test.',
    'הם חלק ממאמצי האגודה הלאומית. This is a test 2.0',
    'הם חלק ממאמצי האגודה הלאומית. This is a test.\nAnd this',
    'הם חלק ממאמצי האגודה הלאומית. This is a test, (this too).\n']

function splitWords(string) {
    if (!string) {
        string = this;
    }

    let suffix = string.trim()[string.length - 1] === '.' ? '' : '.'
    let result = string.trim().concat(suffix).match(/.*?[\.\s]+?/g)

    result = result ? result.map((str) => str.trim()).filter((str) => str !== '') : [string.trim()]

    let lastString = result[result.length - 1]
    if (suffix === '.') {
        result[result.length - 1] = lastString.substring(0, lastString.length - 1)
    }
    return result
}

for (string of testStrings) {
    console.log(splitWords(string))
}

function splitResultWords(result) {
    return splitWords(result.join(' '))
}

let testArray = ['1', '23 45', '45.', '6']

console.log(splitResultWords(testArray))

const contains_heb = (str) => (/[\u0590-\u05FF]/).test(str)

const getAllHebrewElements = () => {

    // To select all elements containing hebrew text.
    // Abandoned in favour of only replacing highlighted text.
    var textTags = document.querySelectorAll("h1, h2, h3, h4, h5, p, li, td, caption, span, a");

    for (let i = 0; i < textTags.length; i++) {
        if (contains_heb(textTags[i].innerHTML)) {
            // console.log(textTags[i].textContent)
        }
    }
    return textTags
}
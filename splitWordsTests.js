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

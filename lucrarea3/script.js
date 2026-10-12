//ex 1 
function calculateSum(a, b) {
    return a + b;
}

console.log(calculateSum(2, 8));
console.log(calculateSum(600, 400));

//ex 2
const student = {
    name: "Mihail",
    age: 17,
    grade: 8,
    introduce: function () {
        console.log("Sunt " + this.name + " și am " + this.age + " ani.");
    }
};

student.introduce();
student.grade = 10;
console.log(student.grade);

//ex 3
const variante = ["piatra", "hartia", "foarfeca"];

const gameScore = {
    player: 0,
    computer: 0,
    draws: 0,
    displayScore: function () {
        alert("Scor:\nTu: " + this.player +
              "\nCalculator: " + this.computer +
              "\nEgalități: " + this.draws);
    }
};

function getComputerChoice() {
    const index = Math.floor(Math.random() * 3);
    return variante[index];
}

function getWinner(userChoice, computerChoice) {
    if (userChoice === computerChoice) {
        gameScore.draws++;
        return "Egalitate!";
    }

    if (
        (userChoice === "piatra" && computerChoice === "foarfeca") ||
        (userChoice === "foarfeca" && computerChoice === "hartia") ||
        (userChoice === "hartia" && computerChoice === "piatra")
    ) {
        gameScore.player++;
        return "Ai câștigat!";
    }

    gameScore.computer++;
    return "Calculatorul a câștigat!";
}

function updatePage(userChoice, computerChoice, result) {
    document.getElementById("alegereJucator").textContent = userChoice;
    document.getElementById("alegereCalculator").textContent = computerChoice;
    document.getElementById("rezultat").textContent = result;
    document.getElementById("scorJucator").textContent = gameScore.player;
    document.getElementById("scorCalculator").textContent = gameScore.computer;
    document.getElementById("scorEgalitati").textContent = gameScore.draws;
    document.getElementById("totalRunde").textContent =
        gameScore.player + gameScore.computer + gameScore.draws;
}

function playRound(userChoice) {
    const computerChoice = getComputerChoice();
    const result = getWinner(userChoice, computerChoice);

    updatePage(userChoice, computerChoice, result);

    setTimeout(function () {
        gameScore.displayScore();
        if (gameScore.player === 5) {
            alert("Ai câștigat jocul! Apasă „Joc nou”.");
        } else if (gameScore.computer === 5) {
            alert("Calculatorul a câștigat jocul! Apasă „Joc nou”.");
        }
    }, 50);
}

function resetGame() {
    gameScore.player = 0;
    gameScore.computer = 0;
    gameScore.draws = 0;
    updatePage("-", "-", "Alege o variantă");
}

document.getElementById("btnPiatra").addEventListener("click", function () {
    playRound("piatra");
});
document.getElementById("btnHartia").addEventListener("click", function () {
    playRound("hartia");
});
document.getElementById("btnFoarfeca").addEventListener("click", function () {
    playRound("foarfeca");
});
document.getElementById("btnReset").addEventListener("click", resetGame);
// ===== Exercițiul 1 =====
let fructe = ["Măr", "Pară", "Banană", "Portocală", "Kiwi"];
console.log(fructe);
console.log(fructe[0]);
console.log(fructe[fructe.length - 1]);
console.log(fructe.length);

// ===== Exercițiul 2 =====
let orase = ["Chișinău", "Bălți", "Cahul"];
orase.push("Orhei");
orase.unshift("Soroca");
orase.pop();
orase.shift();
console.log(orase);

// ===== Exercițiile 3 și 4 =====
let produse = ["Pâine", "Lapte", "Ouă"];

function afiseazaProduse() {
  let zona = document.getElementById("zonaProd");
  if (produse.length === 0) {
    zona.innerHTML = "Lista este goală!";
  } else {
    zona.innerHTML = produse.join(", ");
  }
}

function adaugaSfarsit() {
  produse.push(document.getElementById("prodInput").value);
  afiseazaProduse();
}

function adaugaInceput() {
  produse.unshift(document.getElementById("prodInput").value);
  afiseazaProduse();
}

function stergeInceput() {
  produse.shift();
  afiseazaProduse();
}

function stergeSfarsit() {
  produse.pop();
  afiseazaProduse();
}

afiseazaProduse();

// ===== Exercițiul 5 =====
let elevi = [
  { nume: "Popescu Ana", varsta: 17, nota: 9 },
  { nume: "Rusu Mihai", varsta: 18, nota: 8 },
  { nume: "Ciobanu Maria", varsta: 17, nota: 10 }
];

function afiseazaElevi() {
  let text = "";
  elevi.forEach(function (elev, index) {
    text += (index + 1) + ". " + elev.nume + "<br>" +
            "Vârsta: " + elev.varsta + "<br>" +
            "Nota: " + elev.nota + "<br><br>";
  });
  document.getElementById("numarElevilor").innerHTML = "Număr de elevi: " + elevi.length;
  document.getElementById("zonaCatalog").innerHTML = text;
}

function adaugaElev() {
  let elevNou = {
    nume: document.getElementById("nume").value,
    varsta: Number(document.getElementById("varsta").value),
    nota: Number(document.getElementById("nota").value)
  };
  elevi.push(elevNou);
  afiseazaElevi();

  document.getElementById("nume").value = "";
  document.getElementById("varsta").value = "";
  document.getElementById("nota").value = "";
}

function stergeElev() {
  let nume = document.getElementById("stergeInput").value;
  let elev = elevi.find(function (e) {
    return e.nume === nume;
  });
  if (elev) {
    elevi.splice(elevi.indexOf(elev), 1);
  }
  afiseazaElevi();
}

function cautaElev() {
  let nume = document.getElementById("cautaInput").value;
  let zona = document.getElementById("zonaCautare");
  let elev = elevi.find(function (e) {
    return e.nume === nume;
  });

  if (elev) {
    zona.innerHTML = "Elev găsit!<br>" +
      "Nume: " + elev.nume + "<br>" +
      "Vârsta: " + elev.varsta + "<br>" +
      "Nota: " + elev.nota;
  } else {
    zona.innerHTML = "Elevul nu a fost găsit!";
  }
}

afiseazaElevi();
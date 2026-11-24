# Bandes d'encrage sur les PDF Tauro

## Intention

Beaucoup de visuels sont très clairs : les buses foncées travaillent à peine, et les repères et le nom imprimés en noir sortent flous par manque d'encre. L'atelier ajoute parfois des bandes foncées à la main (modèle : BILBO-P-001, « DUPLEX 106X305 »). decoGestion les dessine lui-même dans la chute.

## Ce qui est décidé (avec l'utilisateur)

- Case **« Bandes d'encrage »** à côté de « Générer regmarks », **cochée par défaut** ; décochée, le PDF garde sa disposition d'avant.
- Les deux **petits côtés** de la plaque toujours (le chariot longe le grand côté, donc chaque passage traverse une bande). Rien sur les grands côtés : envisagé puis retiré, ces bandes sont sur d'autres lignes que les repères et triplaient l'encre.
- Standards et crédences. Sur-mesure (QR, repères mobiles) et teinte masse inchangés.
- Teintes du modèle : bleu foncé C100 M100 N20, presque noir C100 M100 J20 N70, plus un filet noir 100 % K.

## Géométrie (mm, depuis le fond perdu)

- **Petit côté, marge ≥ 20** : 0-2 noir K, 2-4 presque noir, en continu sur toute la plaque, lignes des repères comprises. Reste 6 mm de blanc avant un repère (l'imposition sur-mesure, calée sur i-cut, n'en laisse que 5).
- **Marge < 86** : renfort bleu 5-13, entre le premier et le dernier repère, à 15 mm du centre de chaque repère et à 10 mm du nom.
- **Marge ≥ 86** : à la place du renfort, 26-51 presque noir et 51-76 bleu, en continu.
- **Marge < 20** : pas de bande de ce côté, avertissement dans le journal.
- Crédences : le panneau le plus long et les bords extérieurs comptent ; rien entre les deux panneaux.

## Autour

- Repères et nom en noir 100 % K (avant : RVB 0,0,0, rendu 73/68/67/89 par Ghostscript). Asanti reste seul maître de la séparation réelle.
- Avec bandes, le nom d'un standard passe de 35 à 30 points et sa base de 5 à 7,5 mm, sinon le bas des lettres toucherait la bande.
- JPG : les bandes y figurent quand il est rendu depuis le PDF (crédences, standard sans aperçu).

## Approches

- A. Toujours, sans réglage : pas de retour arrière rapide.
- **B. Case cochée par défaut** *(retenue)*.
- C. Automatique sur les visuels clairs : analyse et seuil, un clair mal classé ressort flou.

## Vérifié avant de coder

15 combinaisons réelles (tous formats, 101x215, 126x260, 151x260, 150x305, « +BLANC ») : visuel identique au pixel près, encre WHITE inchangée, blanc propre autour des repères. Catalogue : 1 879 PDF à 5 mm de fond perdu, une exception (`XALOHA 100x255 DROIT GAUCHE MAT.pdf`, page de 151 cm).

## Reste à valider en atelier

Séparations dans Asanti avec le profil Dibond, lecture des repères par la table, marge non imprimable.

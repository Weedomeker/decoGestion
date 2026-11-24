# Progression de la File : calcul juste et bandeau fixe

Statut : validé le 24/11/2026 (maquette v3).

## Pourquoi

La barre comptait `traités / (traités + toute la file)` : fausse pour une sélection ou une session, elle partait de
l'ancien lancement, reculait à l'ajout d'un job, ignorait échecs et annulations, et affichait « fini » avant les
étiquettes. Placée dans le pied du tableau « En attente », elle remplaçait les boutons et changeait de largeur.

## Objectif

- Un pourcentage qui ne concerne que le lancement en cours, ne recule jamais et n'atteint 100 % qu'après les étiquettes.
- Un emplacement fixe : 44 px sous les onglets, identique au repos et en traitement, dans les deux onglets.
- Voir quel job avance, lequel a échoué et pourquoi.

Hors périmètre : fichiers produits, ordre PDF / JPG / `.cut` / dépôt, tentatives BullMQ, règles Tauro (inchangés).
À éviter : un bandeau qui bouge, un pourcentage qui recule, un temps restant présenté comme certain, une erreur de
suivi qui ferait échouer un job.

## Approches

| Sujet | Écarté | Retenu |
|---|---|---|
| Calcul | Nombre de jobs (un PDF de 600 Mo compte comme un de 10 Mo) ; poids + étapes seuls (barre immobile plusieurs minutes pendant un gros PDF) | Poids + étapes + temps, recalé pendant le lancement |
| Disposition | Barre d'état en bas (barre plus courte) ; rappel global sous l'en-tête | Bandeau sous les onglets |
| Barre | Continue | Un segment par job, large comme son poids ; dernier segment = étiquettes |
| Lignes | Fond qui se remplit (chargé) ; rien | État dans la 1re cellule, étape après le visuel |
| Survol | Fiche aussi sur les lignes (gêne le glisser-déposer) | Loupe + fiche sur les segments ; ligne ↔ segment surlignés |

## Calcul (serveur)

Durées attendues, mesurées sur 86 jobs de production (novembre 2026) : PDF 10 s + 0,75 s/Mo ; JPG 10 s ; dépôt
3 s + 0,12 s/Mo ; enregistrement 25 s ; étiquettes 2 s + 0,3 s par job. Teinte masse et prise en stock : JPG et
enregistrement seulement. Dans une étape, l'avance suit le temps, ralentit à 90 % et plafonne à 98 %. Le rapport
réel / attendu des étapes finies recale le temps restant (borné de 0,05 à 5).

Le serveur diffuse l'état à chaque événement et toutes les 5 s, avec la vitesse et le plafond : le navigateur
prolonge l'animation, car un gros PDF peut bloquer la boucle d'événements du serveur.

Un échec de suivi (id inconnu, erreur interne) est journalisé et n'atteint jamais le job.

## Reste au développeur

Détails de style dans le thème acier, découpage des composants, textes exacts, d'après la maquette v3.

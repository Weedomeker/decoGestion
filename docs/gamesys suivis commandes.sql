WITH mapping_profile AS (
	SELECT st_seq_compt AS sequentiel, REPLACE(st_lib_1_conso, 'PROFILE ', '') AS libelle
	FROM public.fs_stock
	WHERE st_lib_1_conso ilike '%PROFILE%'
),
mapping_kit AS (
	SELECT st_seq_compt AS sequentiel, st_lib_1_conso AS libelle
	FROM public.fs_stock
	WHERE st_lib_1_conso ilike '%kit de pose%'
),
mapping_article AS (
	SELECT st_seq_compt AS sequentiel, st_art_sfamille AS sfamille
	FROM public.fs_stock
),
base AS (
	SELECT
		regexp_replace(ent_code_client, '^LM', '') AS "N° Mag",
		fo_nom_1 AS "Magasin",
		fo_ville AS "Ville",
		ent_ref_client AS "Commande",
		ent_no_offre AS "Offre GamSys",
		STRING_AGG(DISTINCT CASE WHEN endv_no_commande LIKE '%/00' THEN regexp_replace(endv_no_commande, '/00$', '') END, ', ') AS "Dossier GamSys",
		COALESCE(to_date(substring(ent_rmq_int FROM 'du\s+(\d{2}/\d{2}/\d{4})'), 'DD/MM/YYYY'), ent_date_crea_cmd::date) AS "Date de commande",
		STRING_AGG(DISTINCT to_char(bo_date_depart_usine, 'DD/MM/YYYY'), ', ') AS "Date de départ prévisionnelle",
		LEAST(
			COALESCE(MIN(NULLIF(bo_date_souhaitee, DATE '1900-01-01')), MIN(NULLIF(bo_date_imperative, DATE '1900-01-01'))),
			COALESCE(MIN(NULLIF(bo_date_imperative, DATE '1900-01-01')), MIN(NULLIF(bo_date_souhaitee, DATE '1900-01-01')))
		) AS "Date de livraison demandée",
		ROUND((ent_total_lignes_ht + ent_total_livraisons_ht)::numeric, 2) AS "Montant Commande",
		CASE WHEN bool_or(mapping_article.sfamille = 'SMES') THEN 'Oui' ELSE '' END AS "Sur mesure",
		SUM(CASE WHEN mapping_profile.libelle IS NOT NULL THEN endv_quant ELSE 0 END) AS "Nb Profile",
		STRING_AGG(CASE WHEN mapping_profile.libelle IS NOT NULL AND endv_quant > 0 THEN endv_quant || ' x ' || mapping_profile.libelle END, ',' || chr(10)) AS "Détail Profile",
		SUM(CASE WHEN mapping_kit.libelle IS NOT NULL THEN endv_quant ELSE 0 END) AS "Nb Kit de pose",
		STRING_AGG(CASE WHEN mapping_kit.libelle IS NOT NULL AND endv_quant > 0 THEN endv_quant || ' x ' || mapping_kit.libelle END, ',' || chr(10)) AS "Détail Kit de pose",
		SUM(CASE WHEN cat_famille='DIB1' AND cat_type = 'DECO' AND cat_coulstd='BLANC' AND cat_format_x = 101 AND cat_format_y=215 THEN soximp_nbre_feuil_pap ELSE 0 END) AS "101 x 215",
		SUM(CASE WHEN cat_famille='DIB1' AND cat_type = 'DECO' AND cat_coulstd='BLANC' AND cat_format_x = 126 AND cat_format_y=260 THEN soximp_nbre_feuil_pap ELSE 0 END) AS "126 x 260",
		SUM(CASE WHEN cat_famille='DIB1' AND cat_type = 'DECO' AND cat_coulstd='BLANC' AND cat_format_x = 151 AND cat_format_y=260 THEN soximp_nbre_feuil_pap ELSE 0 END) AS "151 x 260",
		SUM(CASE WHEN cat_famille='DIB2' AND cat_type = 'BROS' AND cat_coulstd='CU-NO' THEN soximp_nbre_feuil_pap ELSE 0 END) AS "Cuivre brossé/noir brossé",
		SUM(CASE WHEN cat_famille='DIB2' AND cat_type = 'BROS' AND cat_coulstd='ALU' THEN soximp_nbre_feuil_pap ELSE 0 END) AS "Alu brossé/gris 9006",
		SUM(CASE WHEN cat_famille='DIB2' AND cat_type = 'BROS' AND cat_coulstd='OR-BR' THEN soximp_nbre_feuil_pap ELSE 0 END) AS "Bronze brossé/or brossé",
		SUM(CASE WHEN cat_famille='DIB2' AND cat_type = '2FAC' AND cat_coulstd='GR-ME' THEN soximp_nbre_feuil_pap ELSE 0 END) AS "Gris GRANIT 9006 mat/brillant",
		SUM(CASE WHEN cat_famille='DIB2' AND cat_type = '2FAC' AND cat_coulstd='GRISF' THEN soximp_nbre_feuil_pap ELSE 0 END) AS "Gris foncé PARIS 7016 mat/brillant",
		SUM(CASE WHEN cat_famille='DIB2' AND cat_type = '2FAC' AND cat_coulstd='NOIR' THEN soximp_nbre_feuil_pap ELSE 0 END) AS "Noir mat/brillant",
		MAX(moli_jour_prise_en_charge) AS "Temps alloué au transport",
		STRING_AGG(DISTINCT to_char(NULLIF(bo_date_reelle, DATE '1900-01-01'), 'DD/MM/YYYY'), ', ') AS "Date de départ"
	FROM public.fd_ent_cmde
	LEFT JOIN public.fc_references ON ent_code_client = fo_reference
	LEFT JOIN public.f_link_offre_devis ON linkodcodeoffre = ent_no_offre
	LEFT JOIN public.f_link_offre_lignepf ON linkolcodeligne = linkodpkid
	LEFT JOIN public.fd_entete_devi ON linkodcodedevis = endv_coduniq
	LEFT JOIN public.fi_sol_imp ON soximp_code_devis = endv_coduniq
	LEFT JOIN public.fs_catalogue ON cat_compt = soximp1_seq_papier
	LEFT JOIN mapping_profile ON mapping_profile.sequentiel = endv_orderline_seq_article
	LEFT JOIN mapping_kit ON mapping_kit.sequentiel = endv_orderline_seq_article
	LEFT JOIN mapping_article ON mapping_article.sequentiel = endv_orderline_seq_article
	LEFT JOIN public.ff_livraison ON bo_no_dossier = endv_no_commande
	LEFT JOIN public.fp_mode_livraison ON moli_code = bo_mode_livraison
	WHERE
		ent_date_crea_cmd >= CURRENT_DATE - interval '1 year'
		AND ((ent_code_client LIKE 'LM%' AND ent_code_client NOT LIKE '%M') OR fo_rep_code IN ('SST', 'CRO'))
		AND ent_statut_livraison >= 2
		AND ent_statut_commande < 900
	GROUP BY
		ent_code_client, fo_nom_1, fo_ville, ent_rmq_int, ent_ref_client, ent_no_offre,
		ent_date_crea_cmd, ent_total_lignes_ht, ent_total_livraisons_ht
),
with_delai AS (
	SELECT
		base.*,
		(
			SELECT COUNT(*)
			FROM generate_series(base."Date de commande" + 1, base."Date de livraison demandée", interval '1 day') AS d
			WHERE EXTRACT(DOW FROM d) NOT IN (0, 6)
			AND d::date NOT IN (SELECT fete_date FROM public.fp_jours_feries)
		) AS "Délai fabrication (jours ouvrés)"
	FROM base
)
SELECT
	"N° Mag",
	"Magasin",
	"Ville",
	"Commande",
	"Offre GamSys",
	"Dossier GamSys",
	to_char("Date de commande", 'DD/MM/YYYY') AS "Date de commande",
	"Date de départ prévisionnelle",
	to_char("Date de livraison demandée", 'DD/MM/YYYY') AS "Date de livraison demandée",
	"Délai fabrication (jours ouvrés)",
	"Délai fabrication (jours ouvrés)" - "Temps alloué au transport" AS "Temps alloué à la production",
	"Temps alloué au transport",
	"Date de départ",
	"Montant Commande",
	"Sur mesure",
	"Nb Profile",
	"Détail Profile",
	"Nb Kit de pose",
	"Détail Kit de pose",
	"101 x 215",
	"126 x 260",
	"151 x 260",
	"Cuivre brossé/noir brossé",
	"Alu brossé/gris 9006",
	"Bronze brossé/or brossé",
	"Gris GRANIT 9006 mat/brillant",
	"Gris foncé PARIS 7016 mat/brillant",
	"Noir mat/brillant",
	NULL AS "Nombre de colis"
FROM with_delai
ORDER BY "Offre GamSys"::integer DESC
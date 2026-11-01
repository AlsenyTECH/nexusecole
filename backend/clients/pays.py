"""
Pays desservis : indicatif téléphonique, monnaie, fuseau horaire.
Ajouter un pays = ajouter une ligne ici (et vérifier ses règles scolaires : barème, découpage, mentions).
"""
from collections import namedtuple

Pays = namedtuple("Pays", "nom indicatif chiffres devise symbole fuseau")

PAYS = {
    "SN": Pays("Sénégal", "221", 9, "XOF", "FCFA", "Africa/Dakar"),
    "ML": Pays("Mali", "223", 8, "XOF", "FCFA", "Africa/Bamako"),
    "GN": Pays("Guinée", "224", 9, "GNF", "GNF", "Africa/Conakry"),
    "GM": Pays("Gambie", "220", 7, "GMD", "GMD", "Africa/Banjul"),
    "MR": Pays("Mauritanie", "222", 8, "MRU", "MRU", "Africa/Nouakchott"),
    "GW": Pays("Guinée-Bissau", "245", 9, "XOF", "FCFA", "Africa/Bissau"),
    "CI": Pays("Côte d'Ivoire", "225", 10, "XOF", "FCFA", "Africa/Abidjan"),
    "BF": Pays("Burkina Faso", "226", 8, "XOF", "FCFA", "Africa/Ouagadougou"),
    "NE": Pays("Niger", "227", 8, "XOF", "FCFA", "Africa/Niamey"),
    "TG": Pays("Togo", "228", 8, "XOF", "FCFA", "Africa/Lome"),
    "BJ": Pays("Bénin", "229", 10, "XOF", "FCFA", "Africa/Porto-Novo"),
}
CHOIX_PAYS = [(code, p.nom) for code, p in PAYS.items()]

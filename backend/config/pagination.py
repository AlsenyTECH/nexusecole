from rest_framework.pagination import PageNumberPagination


class Pagination(PageNumberPagination):
    """50 par page ; les listes de référence (classes, matières, cours) peuvent en demander plus (?page_size=)."""

    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 500

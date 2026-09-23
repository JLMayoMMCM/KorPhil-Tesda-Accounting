from django import template

register = template.Library()


@register.filter
def peso(value):
    """Decimal -> '₱89,021.00' (negative as '−₱…')."""
    if value in (None, ""):
        return ""
    sign = "−" if value < 0 else ""
    return f"{sign}₱{abs(value):,.2f}"

from urllib.parse import urlsplit, urlunsplit

from sqlalchemy import select

from app.models import Base, Ingredient, MenuItem, Recipe, User
from config import settings
from db import SessionLocal, create_all, engine


def _redacted_database_url(database_url: str) -> str:
    parsed = urlsplit(database_url)
    if parsed.username is None:
        return database_url

    host = parsed.hostname or ""
    port = f":{parsed.port}" if parsed.port else ""
    username = parsed.username
    redacted_netloc = f"{username}:***@{host}{port}"
    return urlunsplit((parsed.scheme, redacted_netloc, parsed.path, parsed.query, parsed.fragment))


def _get_or_create_user(
    email: str,
    password: str,
    role: str,
    display_name: str | None = None,
) -> User:
    with SessionLocal() as session:
        existing = session.execute(select(User).where(User.email == email)).scalar_one_or_none()
        if existing:
            existing.password = password
            existing.role = role
            existing.display_name = display_name
            session.commit()
            session.refresh(existing)
            return existing

        user = User(email=email, password=password, role=role, display_name=display_name)
        session.add(user)
        session.commit()
        session.refresh(user)
        return user


def _get_or_create_ingredient(
    name: str,
    on_hand_qty: int,
    low_stock_threshold_qty: int,
    is_out: bool = False,
) -> Ingredient:
    with SessionLocal() as session:
        existing = session.execute(
            select(Ingredient).where(Ingredient.name == name)
        ).scalar_one_or_none()
        if existing:
            existing.on_hand_qty = on_hand_qty
            existing.low_stock_threshold_qty = low_stock_threshold_qty
            existing.is_out = is_out
            session.commit()
            session.refresh(existing)
            return existing

        ingredient = Ingredient(
            name=name,
            on_hand_qty=on_hand_qty,
            low_stock_threshold_qty=low_stock_threshold_qty,
            is_out=is_out,
        )
        session.add(ingredient)
        session.commit()
        session.refresh(ingredient)
        return ingredient


def _get_or_create_menu_item(
    name: str,
    price_cents: int,
    category: str | None = None,
    allergens: str | None = None,
) -> MenuItem:
    with SessionLocal() as session:
        existing = session.execute(select(MenuItem).where(MenuItem.name == name)).scalar_one_or_none()
        if existing:
            existing.price_cents = price_cents
            existing.category = category
            existing.allergens = allergens
            session.commit()
            session.refresh(existing)
            return existing

        item = MenuItem(
            name=name,
            price_cents=price_cents,
            category=category,
            allergens=allergens,
        )
        session.add(item)
        session.commit()
        session.refresh(item)
        return item


def _get_or_create_recipe(menu_item_id: int, ingredient_id: int, qty_required: int) -> Recipe:
    with SessionLocal() as session:
        existing = session.execute(
            select(Recipe).where(
                Recipe.menu_item_id == menu_item_id,
                Recipe.ingredient_id == ingredient_id,
            )
        ).scalar_one_or_none()
        if existing:
            existing.qty_required = qty_required
            session.commit()
            session.refresh(existing)
            return existing

        recipe = Recipe(
            menu_item_id=menu_item_id,
            ingredient_id=ingredient_id,
            qty_required=qty_required,
        )
        session.add(recipe)
        session.commit()
        session.refresh(recipe)
        return recipe


def seed() -> None:
    print(
        "Seeding database",
        f"env={settings.app_env}",
        f"url={_redacted_database_url(settings.database_url)}",
    )
    Base.metadata.drop_all(bind=engine)
    create_all()

    _get_or_create_user(
        "kitchen@example.com",
        password="pass",
        role="kitchen",
        display_name="Kitchen",
    )
    _get_or_create_user(
        "foh@example.com",
        password="pass",
        role="foh",
        display_name="Front Of House",
    )
    _get_or_create_user(
        "online@example.com",
        password="pass",
        role="online",
        display_name="Online",
    )

    bun = _get_or_create_ingredient("Bun", on_hand_qty=40, low_stock_threshold_qty=8)
    patty = _get_or_create_ingredient("Patty", on_hand_qty=30, low_stock_threshold_qty=6)
    lettuce = _get_or_create_ingredient("Lettuce", on_hand_qty=20, low_stock_threshold_qty=5)
    tomato = _get_or_create_ingredient("Tomato", on_hand_qty=20, low_stock_threshold_qty=5)
    cheese = _get_or_create_ingredient("Cheese", on_hand_qty=25, low_stock_threshold_qty=5)

    classic_burger = _get_or_create_menu_item(
        "Classic Burger",
        price_cents=1299,
        category="Burgers",
        allergens="gluten",
    )
    cheeseburger = _get_or_create_menu_item(
        "Cheeseburger",
        price_cents=1399,
        category="Burgers",
        allergens="gluten,dairy",
    )
    veggie_burger = _get_or_create_menu_item(
        "Veggie Burger",
        price_cents=1199,
        category="Burgers",
        allergens="gluten",
    )

    _get_or_create_recipe(classic_burger.id, bun.id, qty_required=1)
    _get_or_create_recipe(classic_burger.id, patty.id, qty_required=1)
    _get_or_create_recipe(classic_burger.id, lettuce.id, qty_required=1)
    _get_or_create_recipe(classic_burger.id, tomato.id, qty_required=1)

    _get_or_create_recipe(cheeseburger.id, bun.id, qty_required=1)
    _get_or_create_recipe(cheeseburger.id, patty.id, qty_required=1)
    _get_or_create_recipe(cheeseburger.id, cheese.id, qty_required=1)

    _get_or_create_recipe(veggie_burger.id, bun.id, qty_required=1)
    _get_or_create_recipe(veggie_burger.id, lettuce.id, qty_required=2)
    _get_or_create_recipe(veggie_burger.id, tomato.id, qty_required=2)


if __name__ == "__main__":
    seed()

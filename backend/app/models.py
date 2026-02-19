from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    reservations: Mapped[list[Reservation]] = relationship(back_populates="user")


class Ingredient(Base):
    __tablename__ = "ingredients"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    on_hand_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    low_stock_threshold_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_out: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    recipes: Mapped[list[Recipe]] = relationship(back_populates="ingredient")
    reservation_ingredients: Mapped[list[ReservationIngredient]] = relationship(
        back_populates="ingredient"
    )


class MenuItem(Base):
    __tablename__ = "menu_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    price_cents: Mapped[int] = mapped_column(Integer, nullable=False)

    recipes: Mapped[list[Recipe]] = relationship(back_populates="menu_item")
    reservation_items: Mapped[list[ReservationItem]] = relationship(back_populates="menu_item")


class Recipe(Base):
    __tablename__ = "recipes"
    __table_args__ = (UniqueConstraint("menu_item_id", "ingredient_id", name="uq_recipe_item_ingredient"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    menu_item_id: Mapped[int] = mapped_column(ForeignKey("menu_items.id"), nullable=False)
    ingredient_id: Mapped[int] = mapped_column(ForeignKey("ingredients.id"), nullable=False)
    qty_required: Mapped[int] = mapped_column(Integer, nullable=False)

    menu_item: Mapped[MenuItem] = relationship(back_populates="recipes")
    ingredient: Mapped[Ingredient] = relationship(back_populates="recipes")


class Reservation(Base):
    __tablename__ = "reservations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    state: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    user: Mapped[User] = relationship(back_populates="reservations")
    ingredients: Mapped[list[ReservationIngredient]] = relationship(back_populates="reservation")
    items: Mapped[list[ReservationItem]] = relationship(back_populates="reservation")


class ReservationIngredient(Base):
    __tablename__ = "reservation_ingredients"
    __table_args__ = (
        UniqueConstraint(
            "reservation_id",
            "ingredient_id",
            name="uq_reservation_ingredient",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    reservation_id: Mapped[int] = mapped_column(ForeignKey("reservations.id"), nullable=False)
    ingredient_id: Mapped[int] = mapped_column(ForeignKey("ingredients.id"), nullable=False)
    qty_reserved: Mapped[int] = mapped_column(Integer, nullable=False)

    reservation: Mapped[Reservation] = relationship(back_populates="ingredients")
    ingredient: Mapped[Ingredient] = relationship(back_populates="reservation_ingredients")


class ReservationItem(Base):
    __tablename__ = "reservation_items"
    __table_args__ = (UniqueConstraint("reservation_id", "menu_item_id", name="uq_reservation_item"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    reservation_id: Mapped[int] = mapped_column(ForeignKey("reservations.id"), nullable=False)
    menu_item_id: Mapped[int] = mapped_column(ForeignKey("menu_items.id"), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)

    reservation: Mapped[Reservation] = relationship(back_populates="items")
    menu_item: Mapped[MenuItem] = relationship(back_populates="reservation_items")

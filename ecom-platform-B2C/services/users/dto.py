from __future__ import annotations

import uuid
from datetime import datetime

from common.contract import SellerDTO, UserDTO, dto_json
from models import Seller, User


def user_to_dto(user: User) -> dict:
    roles = list(user.roles or ["buyer"])
    if not roles:
        roles = ["buyer"]
    dto = UserDTO(
        id=str(user.id),
        username=user.username,
        displayName=user.display_name,
        avatar=user.avatar or "",
        email=user.email,
        roles=roles,
        bio=user.bio,
        phone=user.phone,
        createdAt=user.created_at,
    )
    return dto_json(dto)


def seller_to_dto(
    seller: Seller,
    *,
    is_following: bool = False,
) -> dict:
    dto = SellerDTO(
        id=str(seller.id),
        username=seller.username,
        displayName=seller.display_name,
        avatar=seller.avatar or "",
        bio=seller.bio,
        followersCount=seller.followers_count,
        isFollowing=is_following,
        rating=float(seller.rating),
        productsCount=seller.products_count,
        postsCount=seller.posts_count,
        joinedAt=seller.created_at,
        legalType=seller.legal_type if seller.legal_type in {"person", "company"} else None,
        lastName=seller.last_name,
        firstName=seller.first_name,
        patronymic=seller.patronymic,
        legalName=seller.legal_name,
        inn=seller.inn,
        ogrn=seller.ogrn,
        legalAddress=seller.legal_address,
    )
    return dto_json(dto)

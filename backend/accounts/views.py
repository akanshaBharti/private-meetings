from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.db import IntegrityError, transaction
from django.core.exceptions import ValidationError
from rest_framework import status
from rest_framework.authentication import TokenAuthentication
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView


User = get_user_model()


def user_payload(user):
    name = " ".join(part for part in [user.first_name, user.last_name] if part).strip()
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "name": name or user.email,
        "full_name": name or user.email,
    }


def auth_payload(user, token):
    return {"token": token.key, "user": user_payload(user)}


class SignupAPIView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_scope = "auth"

    @transaction.atomic
    def post(self, request):
        name = str(request.data.get("name") or "").strip()
        email = str(request.data.get("email") or "").strip().lower()
        password = str(request.data.get("password") or "")

        errors = {}
        if not name:
            errors["name"] = "Name is required."
        if not email or "@" not in email:
            errors["email"] = "Enter a valid email address."
        if len(password) < 8:
            errors["password"] = "Password must be at least 8 characters."
        try:
            validate_password(password)
        except ValidationError as exc:
            errors["password"] = list(exc.messages)
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        if User.objects.filter(email__iexact=email).exists():
            return Response(
                {"email": "An account with this email already exists."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            user = User.objects.create_user(
                username=email,
                email=email,
                first_name=name,
                password=password,
            )
        except IntegrityError:
            return Response(
                {"email": "An account with this email already exists."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        token, _ = Token.objects.get_or_create(user=user)
        return Response(auth_payload(user, token), status=status.HTTP_201_CREATED)


class LoginAPIView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_scope = "auth"

    def post(self, request):
        email = str(request.data.get("email") or "").strip().lower()
        password = str(request.data.get("password") or "")
        user = User.objects.filter(email__iexact=email, is_active=True).first()
        authenticated_user = authenticate(
            request=request,
            username=user.username if user else email,
            password=password,
        )
        if not authenticated_user:
            return Response(
                {"detail": "Invalid email or password."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        token, _ = Token.objects.get_or_create(user=authenticated_user)
        return Response(auth_payload(authenticated_user, token))


class SessionAPIView(APIView):
    authentication_classes = [TokenAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        token = Token.objects.get(user=request.user)
        return Response(auth_payload(request.user, token))


class LogoutAPIView(APIView):
    authentication_classes = [TokenAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        Token.objects.filter(user=request.user).delete()
        return Response({"detail": "Logged out successfully."})

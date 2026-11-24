from django.urls import path

from .views import LoginAPIView, LogoutAPIView, SessionAPIView, SignupAPIView


urlpatterns = [
    path("signup/", SignupAPIView.as_view(), name="auth-signup"),
    path("login/", LoginAPIView.as_view(), name="auth-login"),
    path("session/", SessionAPIView.as_view(), name="auth-session"),
    path("logout/", LogoutAPIView.as_view(), name="auth-logout"),
]

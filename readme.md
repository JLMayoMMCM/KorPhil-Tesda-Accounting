# TESDA Accounting Disbursement Dashboard
A dashboard for managing and tracking accounting disbursements.

## Stack
- **Database** PosteSql + Google Sheets
- **Backend:** Django
- **Frontend:** HTMX

## Setup

```bash
python -m venv venv
venv\Scripts\activate
pip install django django-htmx
django-admin startproject config .
python manage.py migrate
python manage.py runserver
```

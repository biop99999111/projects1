# Generated manually: drop Payment after removing PortOne integration

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('parking', '0002_payment'),
    ]

    operations = [
        migrations.DeleteModel(name='Payment'),
    ]

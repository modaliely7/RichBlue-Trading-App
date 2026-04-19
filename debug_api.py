
import sys
import os

# Add apps/api to path
sys.path.append(os.path.join(os.getcwd(), 'apps', 'api'))

from app.main import overview
from app.db import session_scope

try:
    print("Testing overview endpoint...")
    result = overview(account_id=1)
    print("Success!")
    print(result)
except Exception as e:
    import traceback
    print("Caught exception:")
    traceback.print_exc()

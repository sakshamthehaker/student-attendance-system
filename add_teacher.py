import sys
import database as db

def main():
    if len(sys.argv) < 4:
        print("\n  Usage: python add_teacher.py <username> <password> <name> [role]")
        print("  Example: python add_teacher.py prof_verma verma123 \"Prof. Ramesh Verma\" Teacher\n")
        sys.exit(1)

    username = sys.argv[1].strip()
    password = sys.argv[2].strip()
    name = sys.argv[3].strip()
    role = sys.argv[4].strip() if len(sys.argv) > 4 else "Teacher"

    try:
        db.init_db()
        user_id = db.add_user(username, password, name, role)
        print(f"\n  ✅ Successfully created {role} account:")
        print(f"     Name:     {name}")
        print(f"     Username: {username}")
        print(f"     Role:     {role}")
        print(f"     ID:       {user_id}\n")
    except Exception as e:
        print(f"\n  ❌ Error: {e}\n")

if __name__ == "__main__":
    main()

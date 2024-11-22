from process_video import process_video_cli
from query_engine import query_menu

def main_menu():
    print("Welcome to the Video Processing and Query System!")
    while True:
        print("\nChoose an option:")
        print("1. Upload a video")
        print("2. Run a query")
        print("3. Exit")
        
        choice = input("Enter your choice: ").strip()
        if choice == "1":
            video_path = input("Enter the absolute path to the video file: ").strip()
            process_video_cli(video_path)
        elif choice == "2":
            query_menu()
        elif choice == "3":
            print("Exiting. Goodbye!")
            break
        else:
            print("Invalid choice. Please try again.")

if __name__ == "__main__":
    main_menu()

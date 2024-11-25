import os

# Directories to ignore
EXCLUDE_DIRS = ['.git', 'node_modules', '__pycache__', 'dist', 'build', '.venv', 'env', '.vscode', '.idea']
# File extensions to consider as code files
CODE_EXTENSIONS = ['.py', '.js', '.ts', '.java', '.cpp', '.c', '.h', '.html', '.css', '.scss', '.rb', '.go', '.php']

def count_lines_of_code(directory):
    total_lines = 0
    for root, dirs, files in os.walk(directory):
        # Ignore the directories in EXCLUDE_DIRS
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]

        for file in files:
            # Check if the file has an extension in CODE_EXTENSIONS
            if any(file.endswith(ext) for ext in CODE_EXTENSIONS):
                file_path = os.path.join(root, file)
                try:
                    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                        lines = f.readlines()
                        total_lines += len(lines)
                except Exception as e:
                    print(f"Error reading {file_path}: {e}")
    return total_lines

if __name__ == '__main__':
    directory = '.'  # You can specify the path to the folder here
    loc = count_lines_of_code(directory)
    print(f"Total lines of code: {loc}")

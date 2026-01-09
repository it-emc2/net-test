import os
import shutil

def convert_project_for_llm(root_dir, output_dir="llm_readable_project"):
    """
    Creates a flat folder with all project files:
    - .js and .ts files converted to .txt
    - .html and .css files copied as-is
    - A STRUCTURE.txt file showing the original folder structure
    """
    
    # Extensions to process
    convert_extensions = {'.js', '.ts', '.jsx', '.tsx'}
    copy_extensions = {'.html', '.css', '.json'}
    
    # Create output directory
    output_path = os.path.join(os.path.dirname(root_dir), output_dir)
    if os.path.exists(output_path):
        shutil.rmtree(output_path)
    os.makedirs(output_path)
    
    # Collect structure info
    structure_lines = []
    structure_lines.append("=" * 60)
    structure_lines.append("ORIGINAL PROJECT STRUCTURE")
    structure_lines.append("=" * 60)
    structure_lines.append(f"Root: {os.path.basename(root_dir)}")
    structure_lines.append("")
    
    files_processed = []
    used_filenames = {}  # Track used names to handle duplicates
    
    for dirpath, dirnames, filenames in os.walk(root_dir):
        # Skip common non-essential directories
        dirnames[:] = [d for d in dirnames if d not in {
            'node_modules', '.git', '__pycache__', 'dist', 'build', 
            '.next', '.cache', 'coverage', output_dir
        }]
        
        # Calculate relative path from root
        rel_dir = os.path.relpath(dirpath, root_dir)
        if rel_dir == '.':
            rel_dir = ''
        
        # Add directory to structure
        depth = rel_dir.count(os.sep) if rel_dir else 0
        indent = "  " * depth
        if rel_dir:
            structure_lines.append(f"{indent}[DIR] {os.path.basename(dirpath)}/")
        
        for filename in sorted(filenames):
            file_ext = os.path.splitext(filename)[1].lower()
            
            if file_ext in convert_extensions or file_ext in copy_extensions:
                # Source file path
                src_path = os.path.join(dirpath, filename)
                original_rel_path = os.path.join(rel_dir, filename) if rel_dir else filename
                
                # Determine destination filename
                if file_ext in convert_extensions:
                    base_new_filename = filename + ".txt"
                else:
                    base_new_filename = filename
                
                # Handle duplicate filenames by prefixing with path
                new_filename = base_new_filename
                if base_new_filename in used_filenames:
                    # Create unique name using path
                    path_prefix = rel_dir.replace(os.sep, "_").replace("/", "_")
                    if path_prefix:
                        new_filename = f"{path_prefix}_{base_new_filename}"
                    else:
                        # Same folder duplicate (shouldn't happen, but just in case)
                        counter = 1
                        while new_filename in used_filenames:
                            new_filename = f"{counter}_{base_new_filename}"
                            counter += 1
                
                used_filenames[new_filename] = original_rel_path
                
                # Copy the file to flat output directory
                dest_path = os.path.join(output_path, new_filename)
                shutil.copy2(src_path, dest_path)
                
                # Add to structure
                file_indent = "  " * (depth + 1)
                structure_lines.append(f"{file_indent}[FILE] {filename}")
                
                files_processed.append({
                    'original': original_rel_path,
                    'flat_name': new_filename,
                    'type': 'converted' if file_ext in convert_extensions else 'copied'
                })
    
    # Add summary and file mapping
    structure_lines.append("")
    structure_lines.append("=" * 60)
    structure_lines.append("FILE MAPPING (Original Path -> Flat Filename)")
    structure_lines.append("=" * 60)
    for f in files_processed:
        structure_lines.append(f"{f['original']}  ->  {f['flat_name']}")
    
    structure_lines.append("")
    structure_lines.append("=" * 60)
    structure_lines.append("SUMMARY")
    structure_lines.append("=" * 60)
    structure_lines.append(f"Total files: {len(files_processed)}")
    structure_lines.append(f"  - JS/TS converted to .txt: {sum(1 for f in files_processed if f['type'] == 'converted')}")
    structure_lines.append(f"  - HTML/CSS/JSON copied: {sum(1 for f in files_processed if f['type'] == 'copied')}")
    
    # Write structure file
    structure_file_path = os.path.join(output_path, "STRUCTURE.txt")
    with open(structure_file_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(structure_lines))
    
    print(f"\nProject converted successfully!")
    print(f"Output folder: {output_path}")
    print(f"Files processed: {len(files_processed)}")
    print(f"Structure file: {structure_file_path}")
    
    return output_path


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1:
        project_dir = sys.argv[1]
    else:
        project_dir = os.getcwd()
    
    output_name = sys.argv[2] if len(sys.argv) > 2 else "llm_readable_project"
    
    convert_project_for_llm(project_dir, output_name)
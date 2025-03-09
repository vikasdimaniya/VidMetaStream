# import math

# # Search by Time Interval:

# # Search by Spatial Location:

# def calculate_proximity(relative_pos1, relative_pos2, threshold=0.05):
#     # Compute Euclidean distance
#     distance = math.sqrt((relative_pos1[0] - relative_pos2[0])**2 + (relative_pos1[1] - relative_pos2[1])**2)
#     return distance < threshold

# query = {"file_name": "example_video.mp4"}
# result = collection.find_one(query)

# for frame in result["metadata"]:
#     objects = frame["objects"]
#     for i in range(len(objects)):
#         for j in range(i + 1, len(objects)):
#             obj1 = objects[i]
#             obj2 = objects[j]
#             if calculate_proximity(obj1["relative_position"], obj2["relative_position"]):
#                 print(f"Frame {frame['frame']} - {obj1['name']} is near {obj2['name']}.")


# # Search by Object Interaction:

# # Efficient Data Filtering for ML

def query_menu():
    print("\nQuery Options:")
    print("1. Find objects in a specific region and time range")
    print("2. Detect interactions between objects")
    print("3. Find objects in a region for a duration")
    print("4. Go back")
    
    choice = input("Enter your choice: ").strip()
    if choice == "1":
        region_query()
    elif choice == "2":
        interaction_query()
    elif choice == "3":
        duration_query()
    elif choice == "4":
        return
    else:
        print("Invalid choice. Please try again.")

def region_query():
    # Implementation placeholder
    print("Region query not yet implemented.")

def interaction_query():
    # Implementation placeholder
    print("Interaction query not yet implemented.")

def duration_query():
    # Implementation placeholder
    print("Duration query not yet implemented.")

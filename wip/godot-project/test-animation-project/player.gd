extends CharacterBody2D

# A variable to hold the target position we want to move to.
var target_position = null

# The speed at which the player moves, in pixels per second.
@export var speed = 100

# This function is called every physics frame.
# 'delta' is the time elapsed since the previous frame.
func _physics_process(delta):
	# If we don't have a target, stop moving.
	if target_position == null:
		velocity = Vector2.ZERO
		return

	# Calculate the distance to the target.
	var distance_to_target = position.distance_to(target_position)

	# If we are very close to the target, snap to it and stop.
	if distance_to_target < 1:
		position = target_position
		target_position = null
		velocity = Vector2.ZERO
		return

	# Calculate the direction to the target and set the velocity.
	var direction = position.direction_to(target_position)
	velocity = direction * speed
	
	# Move the player. move_and_slide() is a built-in function
	# for CharacterBody2D that handles movement and collisions.
	move_and_slide()

# A simple function we can call from other scripts to tell the player where to go.
func move_to(new_position):
	target_position = new_position

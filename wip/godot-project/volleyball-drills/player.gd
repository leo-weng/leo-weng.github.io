extends CharacterBody3D

signal arrived_at_target
signal ball_contacted # New signal for when the ball hits the arms

@export var speed = 5.0
var target_position = null

@onready var arm_pivot = $ArmPivot

func _physics_process(delta):
	if target_position == null:
		velocity = Vector3.ZERO
		return

	var current_pos_2d = Vector2(global_transform.origin.x, global_transform.origin.z)
	var target_pos_2d = Vector2(target_position.x, target_position.z)

	if current_pos_2d.distance_to(target_pos_2d) < 0.1:
		target_position = null
		velocity = Vector3.ZERO
		emit_signal("arrived_at_target")
	else:
		var direction = global_transform.origin.direction_to(target_position)
		velocity.x = direction.x * speed
		velocity.z = direction.z * speed

	move_and_slide()

func move_to(new_pos):
	target_position = new_pos

func set_arms_angle(degrees):
	arm_pivot.rotation_degrees.x = degrees

# This function is called when the Area3D on the arms detects a body.
func _on_area_3d_body_entered(body):
	# We check if the body is the volleyball.
	if body is RigidBody3D:
		emit_signal("ball_contacted")

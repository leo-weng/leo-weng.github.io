extends Node3D

@onready var player = $Actors/Player1
@onready var ball = $Actors/Volleyball
@onready var player_arms = $Actors/Player1/ArmPivot

var player_start_pos = Vector3(0,0.9,7.059)
var ball_start_pos = Vector3(5.992,1.721,1.786)

var is_drilling = false

func _ready():
	player.connect("ball_contacted", _on_player_ball_contacted)
	player.connect("arrived_at_target", _on_player_arrived_at_target)
	reset_drill()

func reset_drill():
	is_drilling = false
	player.global_position = player_start_pos
	player.set_arms_angle(0)

	ball.freeze = true
	ball.global_position = ball_start_pos
	ball.linear_velocity = Vector3.ZERO
	ball.angular_velocity = Vector3.ZERO

# Calculates the required initial velocity to hit a target in a set time.
func calculate_toss_velocity(start_pos, end_pos, time_to_target):
	var gravity = ProjectSettings.get_setting("physics/3d/default_gravity_vector").y
	var displacement = end_pos - start_pos

	var velocity_y = (displacement.y - (0.5 * gravity * time_to_target * time_to_target)) / time_to_target
	var velocity_x = displacement.x / time_to_target
	var velocity_z = displacement.z / time_to_target

	return Vector3(velocity_x, velocity_y, velocity_z)

func _on_play_button_pressed():
	if is_drilling:
		return
	is_drilling = true

	player.set_arms_angle(25)

	var toss_target_pos = player_arms.global_position
	var time_of_flight = 1.6 # Tweak this value to change the arc!

	# Calculate the required starting velocity
	var toss_velocity = calculate_toss_velocity(ball_start_pos, toss_target_pos, time_of_flight)

	# Unfreeze the ball and set its velocity directly
	ball.freeze = false
	ball.linear_velocity = toss_velocity

func _on_pause_button_pressed():
	is_drilling = false

func _on_reset_button_pressed():
	reset_drill()

func _on_player_ball_contacted():
	if not is_drilling: return

	ball.linear_velocity = Vector3.ZERO
	ball.apply_central_impulse(Vector3(0, 4.5, -1.5))

	player.set_arms_angle(0)
	player.move_to(player_start_pos)

func _on_player_arrived_at_target():
	if is_drilling:
		is_drilling = false
		await get_tree().create_timer(1.5).timeout
		reset_drill()

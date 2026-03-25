extends Node3D

@export_group("Properties")
@export var target: Node

@onready var camera = $Camera

# Functions

func _physics_process(delta):
	
	# Set position and rotation to targets
	
	self.position = self.position.lerp(target.global_position, delta * 4)

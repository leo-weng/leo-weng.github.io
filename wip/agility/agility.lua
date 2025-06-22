-- Project #2 - Here's an empty project for you to work with.
-------------------------------------------------------------
-- You can freely change between projects. All of your changes
-- are automatically saved until you close the browser window.

local right = display.newImage("img/sign.png", 500, 300)
local left = display.newImage("img/heart.png", 500, 300)

right.isVisible = false
left.isVisible = false

local currChar = "U"

local function showL( event )
    left.isVisible = true
end
local function showR( event )
    right.isVisible = true
end
local function clearAll( event )
    right.isVisible = false
	left.isVisible = false
end

sequence = {"L", "R", "L", "L", "R"}
for i,v in ipairs(sequence) do
  delay = i*2000
  timer.performWithDelay( delay - 500, clearAll )
  
   if v == "L" then
    timer.performWithDelay( delay, showL )
  elseif v == "R" then
    timer.performWithDelay( delay, showR )
  else 
    print("?")
  end
end
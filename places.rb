require 'open-uri'
require 'json'
require 'mini_magick'
require 'set'
require 'fileutils'

# --- CONFIGURATION ---
# For security, it's best to set this as an environment variable
# In your terminal: export FOURSQUARE_SECRET="YOUR_SECRET_HERE"
FOURSQUARE_SECRET = ENV['FOURSQUARE_SECRET']
API_VERSION = '20200303'.freeze
BASE_MARKER_PATH = 'marker.png'.freeze
OUTPUT_DIR = 'images/markers'.freeze

# --- HELPER METHODS ---

# Creates a clean icon name from the Foursquare icon object.
def get_icon_name(foursquare_icon)
  prefix = foursquare_icon['prefix']
  name = prefix.gsub('https://ss3.4sqi.net/img/categories_v2/', '')
  name = name.gsub('/', '-')
  name.chomp('_').chomp('-')
end

# Creates a composite marker image (circle + icon) and saves it.
def create_marker_image(icon_name, icon_url_prefix, icon_url_suffix)
  print "  -> Generating marker for: #{icon_name} ... "

  # Request a 512px version of the icon
  icon_url = "#{icon_url_prefix}512#{icon_url_suffix}"

  # Use MiniMagick to composite the images
  base_image = MiniMagick::Image.open(BASE_MARKER_PATH)
  icon_to_composite = MiniMagick::Image.open(icon_url)

  # Define the size of the icon on the canvas (60% of the base marker's width)
  icon_size = "#{(base_image.width * 0.8).to_i}x"

  # Composite the icon onto the base marker
  result = base_image.composite(icon_to_composite) do |c|
    c.geometry "#{icon_size}+0+0" # Resize the icon and set its position offset (0,0 with gravity)
    c.gravity 'center'            # Place it in the center
  end

  # Save the final composite image as a PNG
  result.format 'png'
  result.write "#{OUTPUT_DIR}/#{icon_name}.png"
  puts 'OK.'
rescue OpenURI::HTTPError, MiniMagick::Error => e
  puts "FAILED. Reason: #{e.message}"
end

# Recursively parses the category tree.
def parse_categories(categories, unique_icons)
  categories.each do |category|
    if category.key?('icon')
      icon_name = get_icon_name(category['icon'])
      unless unique_icons.include?(icon_name)
        unique_icons.add(icon_name) # Mark as processed
        create_marker_image(icon_name, category['icon']['prefix'], category['icon']['suffix'])
      end
    end

    # Recurse into sub-categories
    if category.key?('categories') && !category['categories'].empty?
      parse_categories(category['categories'], unique_icons)
    end
  end
end

# --- MAIN EXECUTION ---

puts 'Starting process to build all Foursquare markers.'

# 1. Check for Foursquare secret
if FOURSQUARE_SECRET.nil? || FOURSQUARE_SECRET.empty?
  abort('Error: FOURSQUARE_SECRET environment variable not set.')
end

# 2. Prepare directories and check for base marker
FileUtils.mkdir_p(OUTPUT_DIR)
unless File.exist?(BASE_MARKER_PATH)
  abort("Error: Could not find #{BASE_MARKER_PATH}. Please ensure this file exists.")
end

# 3. Fetch the entire Foursquare category tree
puts 'Fetching Foursquare category tree...'
api_url = "https://api.foursquare.com/v2/venues/categories?oauth_token=#{FOURSQUARE_SECRET}&v=#{API_VERSION}"

begin
  response_json = URI.open(api_url).read
  response = JSON.parse(response_json)
rescue OpenURI::HTTPError => e
  abort("Error fetching categories from Foursquare API: #{e.message}")
end

# 4. Recursively parse the tree and generate images
puts 'Parsing categories and generating marker images...'
processed_icons = Set.new
parse_categories(response['response']['categories'], processed_icons)

# 5. Generate the final sprite sheet
puts 'Generating the final sprite sheet...'
# This assumes you have your generate-sprite.js or markers.js script ready
system('node markers.js')
puts 'Sprite sheet generated successfully.'

puts 'Build complete.'

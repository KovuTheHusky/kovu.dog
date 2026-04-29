require 'net/http'
require 'csv'
require 'json'

# The official OurAirports live CSV endpoint
url = URI('https://davidmegginson.github.io/ourairports-data/airports.csv')
puts "Downloading OurAirports CSV data..."

# Force the downloaded string into UTF-8 before doing anything else
response = Net::HTTP.get(url).force_encoding('UTF-8')
puts "Parsing CSV..."

# Parse the CSV using the first row as header keys
csv_data = CSV.parse(response, headers: true)

airports = []

csv_data.each do |row|
  # Filter out small airstrips/heliports without IATA codes
  next if row['iata_code'].nil? || row['iata_code'].strip.empty?

  # Build a lean hash with exactly the columns you requested, casting coordinates to floats
  clean_airport = {
    'name'          => row['name'],
    'latitude_deg'  => row['latitude_deg'].to_f,
    'longitude_deg' => row['longitude_deg'].to_f,
    'iso_country'   => row['iso_country'],
    'iso_region'    => row['iso_region'],
    'iata_code'     => row['iata_code']
  }

  airports << clean_airport
end

puts "Saving #{airports.length} airports to JSON..."

# Write out the optimized file
File.write('airports.json', JSON.pretty_generate(airports))

puts "Done! File saved as airports.json"
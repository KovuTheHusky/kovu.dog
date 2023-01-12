require 'bundler/setup'
require 'json'
require 'nokogiri'

source = []

doc = Nokogiri::HTML(File.open("node_modules/pokemon-icons/assets/icon-symbols.svg"))

doc.xpath('//symbol').each do |symbol|
  source << symbol.at_xpath('@id').value
end

oldJson = nil
if (File.exist?('_data/pokedex.json'))
  oldJson = JSON.parse(File.read('_data/pokedex.json'))
end

json = {
  'normal' => {
    'kanto' => {},
    'johto' => {},
    'hoenn' => {},
    'sinnoh' => {},
    'unova' => {},
    'kalos' => {},
    'alola' => {},
    'unknown' => {}
  },
  'shiny' => {
    'kanto' => {},
    'johto' => {},
    'hoenn' => {},
    'sinnoh' => {},
    'unova' => {},
    'kalos' => {},
    'alola' => {},
    'unknown' => {}
  }
}

totalCaught = 0
totalPokedex = 0

source.each do |entry|
  if (entry[0] != '.')
    name = entry + ''
    type = 'normal'
    if (name.include? '-shiny')
      type = 'shiny'
      name.slice! '-shiny'
    end
    number = name[0..2].to_i
    if (number <= 151)
      region = 'kanto'
    elsif (number <= 251)
      region = 'johto'
    elsif (number <= 386)
      region = 'hoenn'
    elsif (number <= 493)
      region = 'sinnoh'
    elsif (number <= 649)
      region = 'unova'
    elsif (number <= 721)
      region = 'kalos'
    elsif (number <= 807)
      region = 'alola'
    else
      region = 'unknown'
    end
    name = name[4..-1]
    variant = 0
    friendlyName = name
    if (friendlyName.include? '-alola')
      variant = 1
      friendlyName.slice! '-alola'
    end
    if (friendlyName.include? '-galar')
      variant = 1
      friendlyName.slice! '-galar'
    end
    if (friendlyName.include? 'unown-')
      friendlyName.gsub!('-', ' ')
      if (friendlyName == 'unown exclamation')
        friendlyName = 'Unown !'
      elsif (friendlyName == 'unown question')
        friendlyName = 'Unown ?'
      end
    elsif (friendlyName == 'nidoran-f')
      friendlyName = 'nidoran ♀'
    elsif (friendlyName == 'nidoran-m')
      friendlyName = 'nidoran ♂'
    elsif (friendlyName == 'mrmime')
      friendlyName = "Mr. Mime"
    elsif (friendlyName == 'mimejr')
      friendlyName = 'Mime Jr.'
    elsif (friendlyName == 'ho-oh' || friendlyName == 'porygon-z')
      # do nothing
    else
      friendlyName = friendlyName.split(/-/, 2).first
    end
    friendlyName = friendlyName.gsub(/(\w+)/) {|s| s.capitalize}
    caught = 0
    if (oldJson != nil && oldJson[type][region][entry] && oldJson[type][region][entry]['caught'] == 1)
      caught = 1
    end
    json[type][region][entry] = {
      'number' => number,
      'name' => friendlyName,
      'variant' => variant,
      'caught' => caught
    }
    totalPokedex = totalPokedex + 1
    totalCaught = totalCaught + caught
  end
end

file = File.open("_data/pokemongo.json", "w")
file.puts(JSON.pretty_generate({
  'caught' => totalCaught,
  'total' => totalPokedex
}))
file.close

json.each do |k1,type|
  type.each do |k2,region|
    json[k1][k2] = region.sort_by { |k,v| [k.scan(/\d+/).first.to_i, v['name'], v['variant'], k] }.to_h
  end
end

file = File.open("_data/pokedex.json", "w")
file.puts(JSON.pretty_generate(json))
file.close

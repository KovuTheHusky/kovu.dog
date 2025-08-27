require 'csv'

rows = CSV.read('flights.csv')

header = rows.first
pnr_index = header.index('PNR')

unless pnr_index
  exit
end

rows.each do |row|
  row.delete_at(pnr_index)
end

CSV.open('flights.csv', 'w') do |csv|
  rows.each do |row|
    csv << row
  end
end

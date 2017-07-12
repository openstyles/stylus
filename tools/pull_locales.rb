# Install transifex-ruby - https://rubygems.org/gems/transifex-ruby
#
# Create a file called pull_locales_login.rb.
# Contents should be:
#
# Transifex.configure do |config|
#   config.username = 'transifex.username'
#   config.password = 'transifex.password'
# end
#
# Update require_relative to point to this file.

require 'transifex'
require 'fileutils'
require_relative '../stylish-chrome-bin/pull_locales_login'

project_slug = 'stylish-for-chrome'

transifex = Transifex::Client.new
project = transifex.project(project_slug)

project.languages.each do |language|
	code = language.language_code
	puts "Getting locale #{code}"
	dir_name = "_locales/#{code}"
	Dir.mkdir(dir_name) if !Dir.exist?(dir_name)
	has_content = false
	project.resources.each do |resource|
		c = resource.translation(code).content
		file_name = "#{dir_name}/#{resource.name}"
		begin
			completed = resource.stats(code).completed
		rescue Transifex::NotFound
			puts "#{code} not found."
			next
		end
		has_content ||= completed != "0%"
		puts "Writing resource #{file_name}, #{completed} complete."
		File.open(file_name, 'w') { |file| file.write(c) }
	end
	if !has_content
		puts "Locale #{code} has no content, deleting."
		FileUtils.rm_rf(dir_name)
	end
end
